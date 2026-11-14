import "server-only";
import { db } from "./db";

/**
 * Traction numbers, shared by the private dashboard (/stats) and the public page (/traction), so both count the
 * same way. Real usage only: simulated travellers are never counted, and demo rooms are excluded from every room,
 * update, vote and pool figure.
 */
export interface Totals {
  users: number;
  users_in_rooms: number;
  rooms: number;
  rooms_2plus: number;
  cards: number;
  votes: number;
  pools: number;
  claims: number;
  returning: number;
  demo_runs: number;
}

export interface Day {
  day: string;
  active: number;
  new_users: number;
}

export async function getTotals(): Promise<Totals> {
  const sql = db();
  const [totals] = await sql<Totals[]>`
    with real_rooms as (select id from rooms where not is_demo),
         real_members as (
           select m.room_id, m.user_id from room_members m
           join real_rooms r on r.id = m.room_id
           join users u on u.id = m.user_id and not u.is_sim)
    select
      (select count(*)::int from users where not is_sim) as users,
      (select count(distinct user_id)::int from real_members) as users_in_rooms,
      (select count(distinct room_id)::int from real_members) as rooms,
      (select count(*)::int from (select room_id from real_members group by room_id having count(*) >= 2) x) as rooms_2plus,
      (select count(*)::int from cards c join real_rooms r on r.id = c.room_id) as cards,
      (select count(*)::int from votes v join cards c on c.id = v.card_id join real_rooms r on r.id = c.room_id) as votes,
      (select count(*)::int from pools p join real_rooms r on r.id = p.room_id) as pools,
      (select count(*)::int from pool_members pm join pools p on p.id = pm.pool_id join real_rooms r on r.id = p.room_id
         where pm.user_id <> p.organiser_id) as claims,
      (select count(*)::int from users where not is_sim and last_seen_at > created_at + interval '1 day') as returning,
      (select count(*)::int from demo_runs) as demo_runs`;
  return totals!;
}

/** Active and new people per day (UTC), oldest first. */
export async function getDaily(days = 14): Promise<Day[]> {
  const sql = db();
  return sql<Day[]>`
    select to_char(d, 'DD Mon') as day,
      (select count(distinct e.user_id)::int from events e
         left join rooms r on r.id = e.room_id
         join users u on u.id = e.user_id and not u.is_sim
       where e.created_at >= d and e.created_at < d + interval '1 day' and coalesce(r.is_demo, false) = false) as active,
      (select count(*)::int from users u where not u.is_sim and u.created_at >= d and u.created_at < d + interval '1 day') as new_users
    from generate_series(date_trunc('day', now()) - (${days - 1} * interval '1 day'), date_trunc('day', now()), interval '1 day') d
    order by d`;
}
