# CatChum Mobile

A build-free, unofficial mobile recreation of the Kaypro/CP/M game **CatChum**.

## Controls

- Motion mode **Both** accepts either a lateral phone jolt or a rotational edge-down jolt.
- Lateral mode: shift the whole phone sharply left/right/up/down.
- Rotational mode: snap the intended edge downward; left edge down means left, top edge down means up, etc.
- Touch D-pad: original numeric layout `8`, `4`, `6`, `2`.
- Keyboard: arrows, WASD, or `8/4/6/2`.
- Hyperspace: Space or the HYPER button.
- Pause: Escape, P, or the PAUSE button.

## Fidelity basis

The maze, text, difficulty range, hyperspace terminology, extra-cat rules, and seeded high-score names were recovered from the supplied `CATCHUM.COM` and `CATCHUM.DAT` files. The original CP/M binary is not redistributed here. Where the binary did not expose a rule reliably, movement-mode and ghost-targeting behavior follows the documented Pac-Man arcade model while retaining CatChum's terminal presentation.

## Local storage

`catchum-mobile-v1` stores high scores and user settings. `catchum-mobile-motion-mode-v1` stores the selected motion gesture mode. Active games are not persisted.
