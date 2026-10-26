# Teaching Bacterial Chemotaxis

An interactive browser simulator of *E. coli* chemotaxis for teaching: receptor activity, Barkai-Leibler methylation dynamics, exact adaptation and run-and-tumble motility.

**Open it online:** https://granada-lab.github.io/chemotaxis/

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

## Run locally

```bash
npm ci
npm run dev      # http://localhost:3000
npm run build    # static site in dist/
```

## Licence

MIT. If you use it in teaching, a citation is appreciated (see `CITATION.cff`).

Author: Adrián E. Granada
