# CatChum Mobile

A build-free, unofficial mobile recreation of the Kaypro/CP/M game **CatChum**.

## Controls

- Give the phone a short, sharp jolt left, right, up, or down to queue one turn. Gentle tilt and hand jitter are ignored.
- Touch D-pad: original numeric layout `8`, `4`, `6`, `2`.
- Keyboard: arrows, WASD, or `8/4/6/2`.
- Hyperspace: Space or the HYPER button.
- Pause: Escape, P, or the PAUSE button.

## Fidelity basis

The maze, text, difficulty range, hyperspace terminology, extra-cat rules, and seeded high-score names were recovered from the supplied `CATCHUM.COM` and `CATCHUM.DAT` files. The original CP/M binary is not redistributed here. Where the binary did not expose a rule reliably, movement-mode and ghost-targeting behavior follows the documented Pac-Man arcade model while retaining CatChum's terminal presentation.

## Local storage

`catchum-mobile-v1` stores high scores and user settings on the current device. Active games are not persisted.
