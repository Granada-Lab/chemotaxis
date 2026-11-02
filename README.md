# Teaching Bacterial Chemotaxis

An interactive browser simulator of *E. coli* chemotaxis for teaching: receptor activity, Barkai-Leibler methylation dynamics, exact adaptation and run-and-tumble motility.

**Open it online:** https://granada-lab.github.io/chemotaxis/ (works on desktop, tablets and phones)

Students change parameters (CheR and CheB rates, Hill coefficient, CheB selectivity, background and gradient) and watch individual cells and the population adapt in real time. Setting the CheB selectivity from 1 to 0 switches from the robust Barkai-Leibler circuit to a fine-tuned one, where exact adaptation breaks. A built-in tab shows the equations behind each panel.

## Model

- Receptor activity: a = 1 / (1 + (S/K)^n), with K(m) = K0 exp(γ m)
- Methylation: dm/dt = V_R - V_B (β a + (1 - β)); β = 1 gives exact adaptation with steady state a_st = V_R / V_B
- Tumble rate proportional to a / a_st, combined with a temporal-sensing factor; stochastic tumbles with randomised duration and reorientation
- Cell-to-cell diversity in CheR, CheB and Hill coefficient

This is a simplified teaching model, not a quantitative fit. It follows:

- Barkai N, Leibler S. Robustness in simple biochemical networks. *Nature* 387:913 (1997)
- Tu Y, Shimizu TS, Berg HC. Modeling the chemotactic response of *Escherichia coli* to time-varying stimuli. *PNAS* 105:14855 (2008)
- Alon U. *An Introduction to Systems Biology*, 2nd ed., Chapter 9. CRC Press (2020)

## How it is built

A single-page web app with no server: everything runs in the browser.

| Layer | Tool |
|---|---|
| Language | TypeScript |
| User interface | React 19, styled with Tailwind CSS |
| Charts and equations | Recharts, KaTeX |
| Build | Vite, producing a static site |
| Hosting | GitHub Pages, rebuilt by GitHub Actions on every push (`.github/workflows/deploy.yml`) |

**Structure.** The model and the display are kept apart:

- `src/types.ts`: the state of one bacterium, the parameters and their defaults, and K(m)
- `src/hooks/useChemotaxisModel.ts`: the model itself. Signal, receptor activity, methylation, tumbling and movement for every cell, advanced by one time step
- `src/components/Dashboard.tsx`: controls, canvas drawing, charts and the explanatory tabs

**Simulation loop.** Each animation frame (`requestAnimationFrame`, about 60 per second) measures the elapsed time dt, caps it at 0.05 s for numerical stability, and advances every cell by one explicit Euler step. Tumbles are stochastic: in each step a running cell tumbles with probability λ·dt. The model state lives in React refs, not React state, so the canvas can redraw every frame without re-rendering the page; the side panels and charts are refreshed only every 0.12 s of simulated time.

**Exercises for students who want to extend it**

1. Replace the Hill function with the receptor free-energy model of Tu, Shimizu & Berg (2008) and compare the adaptation curves.
2. Remove the temporal-sensing shortcut in the tumble rate, so that the run bias comes from receptor activity alone. What has to change for chemotaxis to remain visible?
3. Write an automated test that checks exact adaptation: after a step in background attractant, activity must return to a_st = V_R / V_B when β = 1, and must not when β = 0.
4. Swap the Euler step for a higher-order integrator and measure how the results depend on the frame rate.
5. Add a second receptor type with its own ligand, and let cells face two competing gradients.

## How it was made

Model, teaching design and parameter choices: Adrián E. Granada. The interface code was written with the help of AI coding assistants (Google AI Studio, Claude), then reviewed and tested by the author. The file `metadata.json` is a leftover of the Google AI Studio project format.

## Run locally

```bash
npm ci
npm run dev      # http://localhost:3000
npm run build    # static site in dist/
```

## Licence

MIT. If you use it in teaching, a citation is appreciated (see `CITATION.cff`).

Author: Adrián E. Granada · more from the group: [granada-lab.github.io](https://granada-lab.github.io/) · [granadalab.org](https://granadalab.org) · [github.com/Granada-Lab](https://github.com/Granada-Lab)
