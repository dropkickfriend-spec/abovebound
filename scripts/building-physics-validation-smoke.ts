import { runBuildingPhysicsValidation } from '../src/lib/building_physics_validation';

const report = runBuildingPhysicsValidation();
if (!report.readyForScreening || report.failed > 0) {
  throw new Error(`Physics validation failed: ${JSON.stringify(report.cases.filter(item => item.status === 'fail'))}`);
}
if (report.cases.length < 8) throw new Error('Expected all numerical validation cases to run.');
console.log(JSON.stringify({ scorePercent: report.scorePercent, passed: report.passed, warned: report.warned, failed: report.failed }, null, 2));
