# 02 · The idea

> The room should exist before anyone joins.

A flight number and a date (`AI 101` on 14 December), a train number and a date, or a bus route and a departure are
public, shared and unambiguous. Because they are public, Limbo can open a room for any of them the first time anyone
asks. The second person to type `AI 101` is already in a room with the first. Nobody organises it, nobody invites
anyone, nobody signs up.

That one decision solves the cold-start problem that kills most community apps: the community is defined by the trip,
not by whoever bothered to create a group.

## In one picture

```
 type "AI 101", 14 Dec ──► room exists?  no ──► server creates a Nexconn community channel      (03)
          │                    │ yes
          ▼                    ▼
   guest identity, no sign-up ──► join the channel ──► history + live messages               (03)
          │
          ├── post an update ("rebooking desk at gate 12") ──► custom message, signed state   (04, 05)
          │        others tap ✓ ──► server recounts ──► signed metadata pushed to everyone   (04, 05)
          │        └── the status line at the top: "Delayed about 2 hours · 4 confirmed"       (04)
          │
          ├── share a cab or room ──► claim a seat ──► row lock decides ──► private group chat  (06)
          │
          ├── chat, in any language ──► translated for each reader                         (07)
          │
          └── verified airline or station staff ──► Official, pinned, unforgeable           (05)
```

## The rules we held ourselves to

1. **Answers before chatter.** Opening a room must answer "what's happening?" at a glance. The status sits above the
   chat, in plain words.
2. **Honest about uncertainty.** Every update shows how many people confirmed it and how fresh it is. Unconfirmed
   things look unconfirmed; disputed things look disputed. Nothing is called official unless it is.
3. **Fair by construction.** When two people want the last seat in a cab, one of them gets it, and everyone sees the
   same answer.
4. **Zero friction.** One input, one tap. No account, no email, no permission prompts on the way in.
5. **Kind to the stressed and the unfamiliar.** Plain words, large tap targets, translation everywhere, voice input,
   large text, dark mode for night travel.
6. **Never touch money.** People split costs among themselves. That removes a whole category of fraud and risk.
7. **Measure, don't claim.** Every number in this repository comes from a test you can run
   ([chapter 10](../10_tested_for_real)).

## What Limbo is not

- Not a flight tracker. It does not compete with airline apps or FlightAware; it carries what passengers see.
- Not an official source. It is a place where affected people share what they know, clearly labelled as such.
- Not a social network. Rooms are tied to one trip and close two days after it.

**Next:** [03 · The room →](../03_the_room)
