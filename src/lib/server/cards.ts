import "server-only";
import { randomUUID } from "node:crypto";
import {
  KIND_SPEC,
  MSG,
  type Author,
  type IntelContent,
  type IntelKind,
  looksLikeContactDetails,
  type IntelState,
  type NewIntel,
  type VoteChoice,
} from "@/lib/shared/cards";
import type { CardDTO } from "@/lib/shared/dto";
import { db } from "./db";
import { HttpError, rateLimit, track } from "./http";
import { sendCommunityMessage, setCommunityMessageMetadata } from "./nexconn";
import type { RoomRow } from "./rooms";
import type { User } from "./session";
import { signedMetadata } from "./signing";

interface CardRow {
  id: string;
  room_id: string;
  author_id: string;
  kind: IntelKind;
  official: boolean;
  content: IntelContent;
  message_id: string | null;
  confirms: number;
  disputes: number;
  last_confirm_at: Date | null;
  superseded: boolean;
  removed: boolean;
  ver: number;
  expires_at: Date;
}


export type { CardDTO };

export function authorOf(user: User): Author {
  return { id: user.id, name: user.display_name, color: user.avatar_color };
}

function stateOf(row: CardRow): IntelState {
  return {
    ver: row.ver,
    confirms: row.confirms,
    disputes: row.disputes,
    lastConfirmAt: row.last_confirm_at ? row.last_confirm_at.getTime() : null,
    superseded: row.superseded,
    removed: row.removed,
    official: row.official ? (row.content.official?.org ?? null) : null,
  };
}

export function toCardDTO(row: CardRow, myVote: CardDTO["myVote"] = null): CardDTO {
  return { cardId: row.id, messageId: row.message_id, content: row.content, meta: signedMetadata(row.id, stateOf(row)), myVote };
}

async function publishState(row: CardRow, room: Pick<RoomRow, "channel_id">): Promise<void> {
  if (!row.message_id) return;
  await setCommunityMessageMetadata({
    channelId: room.channel_id,
    messageId: row.message_id,
    operatorUserId: row.author_id,
    metadata: signedMetadata(row.id, stateOf(row)),
  });
}

const OFFICIAL_MIN_LIFETIME = 12 * 60 * 60 * 1000;

/** Post a fact. Agents' posts become Official cards automatically. */
export async function postIntel(room: RoomRow, user: User, input: NewIntel): Promise<CardDTO> {
  if (looksLikeContactDetails(`${input.text} ${input.detail ?? ""}`)) {
    throw new HttpError(400, "contact_details", "Please don't post phone numbers or emails here.");
  }
  await rateLimit(`intel:${user.id}`, 6, 60);
  await rateLimit(`intel-h:${user.id}`, 40, 3600);

  const sql = db();
  const now = Date.now();
  const spec = KIND_SPEC[input.kind];
  const official = user.is_agent && user.agent_org ? user.agent_org : null;
  const lifetime = official ? Math.max(spec.lifetimeMs, OFFICIAL_MIN_LIFETIME) : spec.lifetimeMs;

  // A newer delay estimate or gate change replaces the previous live one. A
  // community post never overrides an official card of the same kind.
  let previous: CardRow | null = null;
  if (spec.supersedable) {
    const rows = await sql<CardRow[]>`
      select * from cards
      where room_id = ${room.id} and kind = ${input.kind} and not superseded and not removed
        and expires_at > now() ${official ? sql`` : sql`and not official`}
      order by created_at desc limit 1`;
    previous = rows[0] ?? null;
  }

  const cardId = randomUUID();
  const content: IntelContent = {
    v: 1,
    cardId,
    kind: input.kind,
    text: input.text,
    ...(input.detail ? { detail: input.detail } : {}),
    ...(input.kind === "delay" && input.delayMinutes !== undefined ? { delayMinutes: input.delayMinutes } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(official ? { official: { org: official } } : {}),
    createdAt: now,
    expiresAt: now + lifetime,
    ...(previous ? { supersedes: previous.id } : {}),
    lang: user.language,
    author: authorOf(user),
  };

  const [row] = await sql<CardRow[]>`
    insert into cards (id, room_id, author_id, kind, official, content, supersedes, expires_at)
    values (${cardId}, ${room.id}, ${user.id}, ${input.kind}, ${official !== null}, ${sql.json(content as never)},
            ${previous?.id ?? null}, ${new Date(content.expiresAt)})
    returning *`;
  if (!row) throw new Error("card insert failed");

  let messageId: string;
  try {
    ({ messageId } = await sendCommunityMessage({
      channelId: room.channel_id,
      fromUserId: user.id,
      messageType: MSG.intel,
      content,
      metadata: signedMetadata(cardId, stateOf(row)),
      pushContent: official ? `${official}: ${input.text}` : input.text,
    }));
  } catch (err) {
    await sql`delete from cards where id = ${cardId}`;
    throw err;
  }
  const [sent] = await sql<CardRow[]>`update cards set message_id = ${messageId} where id = ${cardId} returning *`;

  if (previous) {
    const [old] = await sql<CardRow[]>`
      update cards set superseded = true, ver = ver + 1 where id = ${previous.id} returning *`;
    if (old) await publishState(old, room).catch(() => {});
  }

  void track("card_posted", user.id, room.id, { kind: input.kind, official: official !== null, demo: room.is_demo });
  return toCardDTO(sent ?? row);
}

/** Confirm, dispute, or clear a vote. Counts are recomputed from the votes table inside one transaction. */
export async function vote(room: RoomRow, user: User, cardId: string, choice: VoteChoice): Promise<CardDTO> {
  await rateLimit(`vote:${user.id}`, 60, 60);
  const sql = db();

  const row = await sql.begin(async (tx) => {
    const [card] = await tx<CardRow[]>`select * from cards where id = ${cardId} and room_id = ${room.id} for update`;
    if (!card) throw new HttpError(404, "no_card", "That update no longer exists.");
    if (card.author_id === user.id) throw new HttpError(400, "own_card", "You can't confirm your own update.");
    if (card.official) throw new HttpError(400, "official", "Official updates can't be voted on.");
    if (card.removed || card.superseded || card.expires_at.getTime() <= Date.now()) {
      throw new HttpError(409, "card_closed", "This update is out of date.");
    }

    if (choice === "none") {
      await tx`delete from votes where card_id = ${cardId} and user_id = ${user.id}`;
    } else {
      await tx`
        insert into votes (card_id, user_id, vote) values (${cardId}, ${user.id}, ${choice})
        on conflict (card_id, user_id) do update set vote = excluded.vote, updated_at = now()`;
    }
    const [updated] = await tx<CardRow[]>`
      with t as (
        select count(*) filter (where vote = 'confirm')::int as c,
               count(*) filter (where vote = 'dispute')::int as d,
               max(updated_at) filter (where vote = 'confirm') as lc
        from votes where card_id = ${cardId}
      )
      update cards set confirms = t.c, disputes = t.d, last_confirm_at = t.lc, ver = ver + 1
      from t where cards.id = ${cardId}
      returning cards.*`;
    if (!updated) throw new Error("vote update failed");
    return updated;
  });

  await publishState(row, room);
  void track("vote", user.id, room.id, { choice, demo: room.is_demo });
  return toCardDTO(row, choice === "none" ? null : choice);
}

/** Cards for the board and timeline bootstrap (last 48 hours). */
export async function listCards(roomId: string, userId: string): Promise<CardDTO[]> {
  const rows = await db()<(CardRow & { my_vote: "confirm" | "dispute" | null })[]>`
    select c.*, v.vote as my_vote
    from cards c left join votes v on v.card_id = c.id and v.user_id = ${userId}
    where c.room_id = ${roomId} and c.message_id is not null and c.created_at > now() - interval '48 hours'
    order by c.created_at desc limit 150`;
  return rows.map((r) => toCardDTO(r, r.my_vote));
}
