/**
 * Lotka–Volterra predator–prey model: dR/dt = αR − βRF, dF/dt = δRF − γF, with populations in
 * tens of animals. Integrated with fourth-order Runge–Kutta.
 */

export const rates = { alpha: 1.1, beta: 0.4, delta: 0.1, gamma: 0.4 }

/** The balance point the populations circle around: R = γ/δ, F = α/β. */
export const equilibrium = { rabbits: rates.gamma / rates.delta, foxes: rates.alpha / rates.beta }

type State = [rabbits: number, foxes: number]

function derivative([R, F]: State): State {
  const { alpha, beta, delta, gamma } = rates
  return [alpha * R - beta * R * F, delta * R * F - gamma * F]
}

export function step(state: State, dt: number): State {
  const k1 = derivative(state)
  const k2 = derivative([state[0] + (dt / 2) * k1[0], state[1] + (dt / 2) * k1[1]])
  const k3 = derivative([state[0] + (dt / 2) * k2[0], state[1] + (dt / 2) * k2[1]])
  const k4 = derivative([state[0] + dt * k3[0], state[1] + dt * k3[1]])
  return [state[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), state[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])]
}

export type Sample = { t: number; rabbits: number; foxes: number }

export function simulate(rabbits: number, foxes: number, duration: number, dt = 0.01): Sample[] {
  const samples: Sample[] = [{ t: 0, rabbits, foxes }]
  let state: State = [rabbits, foxes]
  const steps = Math.round(duration / dt)
  for (let index = 1; index <= steps; index++) {
    state = step(state, dt)
    samples.push({ t: index * dt, rabbits: state[0], foxes: state[1] })
  }
  return samples
}

/** Conserved along every orbit; a good integrator keeps it constant. */
export function invariant(rabbits: number, foxes: number) {
  const { alpha, beta, delta, gamma } = rates
  return delta * rabbits - gamma * Math.log(rabbits) + beta * foxes - alpha * Math.log(foxes)
}

/** Times of each local maximum of a series, used to show that fox peaks lag rabbit peaks. */
export function peakTimes(samples: Sample[], key: 'rabbits' | 'foxes') {
  const times: number[] = []
  for (let index = 1; index < samples.length - 1; index++) {
    if (samples[index][key] > samples[index - 1][key] && samples[index][key] >= samples[index + 1][key]) times.push(samples[index].t)
  }
  return times
}
