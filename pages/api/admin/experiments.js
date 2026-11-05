// Admin → Tests: split test results (lib/experimentsStore.js).
import { getExperimentResults } from '../../../lib/experimentsStore';

export default async function handler(req, res) {
  try {
    return res.status(200).json({ tests: await getExperimentResults() });
  } catch (err) {
    console.error('Experiment results failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
