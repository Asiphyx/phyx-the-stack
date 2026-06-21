# Phyx the Stack Roadmap

This is the post-jam direction, not a promise that all of this already exists.
The current build is still the command-stack combat prototype.

## Core Problem To Fix First

The current loop is too easy to autopilot: click the obvious modules, send the
stack, watch Cait clean up, repeat. The next design pass should make the player
care about what they are sending before adding more spectacle.

Immediate goals:

- Make enemy intent matter before SEND STACK.
- Make repeated lazy stacks create risk.
- Make Cait's big payoff require setup.
- Make the preview plain enough that players can see danger without doing math.
- Make draft rewards create recognizable builds.

## Research Basis

Genre-breaking games work best when the alternate mode is short, readable, and
emotionally tied to the main loop. They work worst when the alternate mode
replaces the best part of the game for too long.

Examples and takeaways:

- Nier uses camera shifts, bullet patterns, and text-adventure breaks to keep
  the action RPG structure surprising. The useful lesson is controlled variety:
  the game returns to its base identity after the break.
- Undertale and Deltarune pair turn/action choices with bullet-hell defense.
  The useful lesson is that the alternate mode is the cost of a decision, not a
  disconnected side activity.
- Pony Island gets mileage from being unreliable and self-aware, but feedback
  around similar meta games warns that shallow repetition still gets boring if
  the underlying loop is thin.
- Inscryption is the warning sign: many players love the strongest core act but
  bounce when later structural shifts feel like a weaker replacement instead of
  an escalation.
- Nier Automata community feedback is split around repeated hacking/alternate
  sections: some players value the variety, while others call repeated route
  structures a slog. That means Phyx should avoid forcing long repeated genre
  chores.

Community feedback pattern:

- Players forgive weirdness when the core loop is already strong.
- Players resent mode shifts when those shifts feel weaker than the thing they
  were enjoying.
- Players like being surprised, but they want a readable cause: "I stacked
  badly, so Budder got in" is better than "the game randomly changed."
- Repeated mandatory mini-games become chores fast. Short, escalating breaches
  are safer than long alternate campaigns.

Reference links:

- https://www.wired.com/2010/05/nier-review/
- https://parryeverything.com/tag/bullet-hell/
- https://www.pcgamer.com/games/rpg/deltarunes-new-chapters-defy-every-rule-of-rpg-logic/
- https://www.newgamenetwork.com/article/1421/pony-island-review/
- https://www.reddit.com/r/patientgamers/comments/1stzf2l/inscryption_a_game_i_really_wish_i_liked_more/
- https://www.neogaf.com/threads/nier-automatas-is-excellent-at-genre-shifts-route-b-gameplay-spoilers.1414941/

## Budder Cat Design Pillar

Budder Cat is not just the final boss. Budder is the force that corrupts the
genre.

Design rule:

> Budder is a rumor in normal fights, a problem in elites, and the game itself
> in the boss.

This keeps the genre-breaking finale from feeling random. The player should see
small warning signs across the run, learn that sloppy stacking feeds the breach,
then understand why the boss can rewrite the battlefield.

## Budder Glitch Meter

Add a visible Budder Glitch meter to all combat stages.

Meter rises when:

- The player sends a stack with fewer than two meaningful module roles.
- The player repeats the same module pattern too often.
- The player ignores a high-risk enemy intent.
- The player lets summons/buffs sit unanswered.

Meter falls or converts into bonus when:

- The player answers enemy intent correctly.
- The player varies module roles.
- The player marks a target before Cait's payoff.
- The player clears a Budder hazard cleanly.

The meter must be predictable. It should not feel like random punishment.

## Stage Escalation

### Normal Fights

Budder should appear as light interference:

- One intent swap.
- One strange module draw.
- Small battlefield tilt.
- A warning line from Cait.
- A quick roll-by animation with no full mode change.

Goal: teach the player that something is watching the stack.

### Elite Fights

Budder interference becomes a real tactical problem:

- Stack order reverses for one turn.
- One enemy gains a Budder shield that must be routed around.
- A glitch must be cleared before SEND STACK.
- One short dodge/click event affects the next turn.

Goal: make the player prepare for the boss without derailing the whole fight.

### Boss Fight

Budder can fully break genre:

- RPG battle breach: explicit party-style command turn.
- 2D platformer breach: dodge hazards for a short window.
- Bullet-hell burst: move Cait's heart/core through attack patterns.
- Rhythm stack: send modules on beat for bonus Cait hits.
- Puzzle lock: arrange modules before the timer ends.
- Fake OS panic: close corrupted windows or restore Cait signal.

Goal: the boss becomes a sequence of controlled genre breaches, not a long
replacement game.

## First Shippable Slice

Do not build the full genre-break suite first. Build one small Budder breach
that makes the current combat less boring.

Slice:

1. Add `budderGlitch` to combat state.
2. Score every sent stack:
   - `S`: varied roles, enemy intent answered, Cait setup present.
   - `A/B`: useful but imperfect.
   - `C`: repetitive or low setup.
   - `F`: ignores obvious danger.
3. Raise Budder Glitch on `C/F`; reduce or reward on `S/A`.
4. At 100, trigger one Budder roll-by:
   - swap the next enemy intent, or
   - add one weird module, or
   - tilt the battlefield for one turn.
5. Reset the meter after the event.

Acceptance:

- A player who clicks the same two things repeatedly sees the meter rise.
- A player who varies stack roles sees the meter stabilize.
- The event is visible, short, and mechanically relevant.
- The event does not block the run or require a new control scheme yet.

## Later Slices

- Add a clearer stack preview: incoming damage, block gained, Cait hit estimate,
  Budder risk, and stack grade.
- Add one elite-only Budder mini event.
- Add one boss-only genre breach.
- Add Cait callouts that explain why Budder is reacting.
- Add build tags to draft rewards so players can recognize strategy paths:
  Mark, Shield, Jam, Dirty, Momentum.

## Guardrails

- Never let a genre breach run so long that the player misses the core stack
  game.
- Never make the breach pure randomness; player behavior should provoke it.
- Never add a new mode without a clear success/failure outcome that feeds back
  into combat.
- Keep the first version readable over clever.
