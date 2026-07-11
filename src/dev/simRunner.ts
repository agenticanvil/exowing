import { FlightSimulation } from '../sim/flightSimulation';

const sim = new FlightSimulation();
for (let frame = 0; frame < 60 * 5; frame++) {
  sim.step({ steerX: frame < 60 ? 1 : 0, steerY: 0, fire: frame % 12 === 0, pace: 0 }, 1 / 60);
}
console.log(JSON.stringify({ railDistance: sim.railDistance, player: sim.player, enemies: sim.enemies.length, projectiles: sim.projectiles.length, score: sim.score }, null, 2));
