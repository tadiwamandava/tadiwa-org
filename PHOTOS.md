# Shot list

The redesign deals a work section where hovering a project reveals one 4:3
photograph beside it, 300px wide. Six projects, six pictures. The design needs
these to exist; it has no fallback that is as good.

These are first-choice imagery because nobody else has them. Every other
student portfolio in this field illustrates itself with stock circuit boards.

## Format

- **4:3 landscape**, shot horizontally. Deliver the largest your phone makes.
- **One light, from the side.** A window during the day, or a desk lamp with
  everything else off. Not the ceiling light, and not the phone's flash.
- **Dark surface**: the bench itself, a dark mat, a cutting board. The site is
  near-black and warm, so a dark warm ground makes the photographs sit in the
  page instead of on it.
- **Close.** Fill the frame with the object. A board shot from a metre away is
  a picture of a desk.
- Do not retouch or filter. Raw is correct here.
- Drop them in `public/photos/` as `<project-slug>.jpg`.

## The six

| Slug | Shot |
| --- | --- |
| `riscv-cpu-verification` | The Basys 3 with the core loaded. Top-down, FPGA centred, the UART wire running out of frame. Switches and LEDs visible. |
| `rtos-stm32` | The STM32F446 on the breadboard **with the logic analyzer probes clipped on**. This is the most important picture on the site: it is the one that shows measurement happening. |
| `cuda-matmul` | Nsight Compute on screen, cropped to one occupancy or warp-stall panel at true size. Dark theme. Not the whole window. |
| `llm-inference-engine` | A terminal running the parity test, cropped to the logit-diff output. Or the engine's own page mid-generation on your machine. |
| `lsm-storage-engine` | `redis-cli` connected to your engine, cropped to a few commands and replies. The point is that a real client speaks to it. |
| `k20-curation` | Hive in use at true size, cropped to one board of curated items. Not a full-page screenshot. |

## If you want to shoot more than six

A seventh and eighth would give the page a spare and let me crop differently
per slot rather than reuse:

- The bench itself: hot air station, microscope, spools of solder.
- Microsoldering under the scope, close enough that the traces are the subject.

## Why this and not stock

The direction's own rules rank imagery: the project's own photographs first,
open-collection pictures of the field third, generic stock last, and that last
tier is described as "atmosphere, never a stand-in". Architecture photographs
of bridges and atriums were dealt as the fallback for this build. On a page
about measuring hardware they would read as exactly the decoration this
redesign exists to remove.
