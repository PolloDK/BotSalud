import { readRecentDays } from '../src/services/healthConnect';

const mockHC = require('react-native-health-connect');

beforeEach(() => jest.clearAllMocks());

it('returns one payload per requested day with a local date', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.readRecords.mockResolvedValue({ records: [] });
  mockHC.aggregateRecord.mockResolvedValue({});
  const result = await readRecentDays(2);
  expect(result).toHaveLength(2);
  expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // oldest day first
  expect(result[0].date < result[1].date).toBe(true);
  expect(result[1].weight_kg).toBeUndefined();
  expect(result[1].steps).toBeUndefined();
});

it('extracts weight from Weight records', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.aggregateRecord.mockResolvedValue({});
  mockHC.readRecords.mockImplementation((type: string) => {
    if (type === 'Weight') {
      return Promise.resolve({
        records: [{ weight: { inKilograms: 80.5 } }],
      });
    }
    return Promise.resolve({ records: [] });
  });
  const [today] = await readRecentDays(1);
  expect(today.weight_kg).toBe(80.5);
});

it('reads deduplicated steps from the aggregate API (not summed raw records)', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.readRecords.mockResolvedValue({ records: [] });
  mockHC.aggregateRecord.mockImplementation((req: any) => {
    if (req.recordType === 'Steps') return Promise.resolve({ COUNT_TOTAL: 8000 });
    return Promise.resolve({});
  });
  const [today] = await readRecentDays(1);
  expect(today.steps).toBe(8000);
});

it('reads deduplicated sleep hours from the aggregate API', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.readRecords.mockResolvedValue({ records: [] });
  mockHC.aggregateRecord.mockImplementation((req: any) => {
    if (req.recordType === 'SleepSession') return Promise.resolve({ SLEEP_DURATION_TOTAL: 27000 });
    return Promise.resolve({});
  });
  const [today] = await readRecentDays(1);
  expect(today.sleep_hours).toBe(7.5); // 27000s = 7.5h, deduplicated
});

it('reads heart-rate avg/min/max from the aggregate API', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.readRecords.mockResolvedValue({ records: [] });
  mockHC.aggregateRecord.mockImplementation((req: any) => {
    if (req.recordType === 'HeartRate') return Promise.resolve({ BPM_AVG: 72, BPM_MIN: 48, BPM_MAX: 150 });
    return Promise.resolve({});
  });
  const [today] = await readRecentDays(1);
  expect(today.hr_avg).toBe(72);
  expect(today.hr_min).toBe(48);
  expect(today.hr_max).toBe(150);
});

it('reads distance km, floors and elevation from aggregates', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.readRecords.mockResolvedValue({ records: [] });
  mockHC.aggregateRecord.mockImplementation((req: any) => {
    if (req.recordType === 'Distance') return Promise.resolve({ DISTANCE: { inKilometers: 8.2 } });
    if (req.recordType === 'FloorsClimbed') return Promise.resolve({ FLOORS_CLIMBED_TOTAL: 12 });
    if (req.recordType === 'ElevationGained') return Promise.resolve({ ELEVATION_GAINED_TOTAL: { inMeters: 45 } });
    return Promise.resolve({});
  });
  const [today] = await readRecentDays(1);
  expect(today.distance_km).toBe(8.2);
  expect(today.floors).toBe(12);
  expect(today.elevation_m).toBe(45);
});

it('computes sleep stage hours from SleepSession stages', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.aggregateRecord.mockResolvedValue({});
  mockHC.readRecords.mockImplementation((type: string) => {
    if (type === 'SleepSession') return Promise.resolve({ records: [{
      startTime: '2026-08-24T00:00:00.000Z', endTime: '2026-08-24T08:00:00.000Z',
      stages: [
        { stage: 5, startTime: '2026-08-24T00:00:00.000Z', endTime: '2026-08-24T02:00:00.000Z' }, // deep 2h
        { stage: 6, startTime: '2026-08-24T02:00:00.000Z', endTime: '2026-08-24T03:30:00.000Z' }, // rem 1.5h
        { stage: 4, startTime: '2026-08-24T03:30:00.000Z', endTime: '2026-08-24T08:00:00.000Z' }, // light 4.5h
      ],
    }] });
    return Promise.resolve({ records: [] });
  });
  const [today] = await readRecentDays(1);
  expect(today.sleep_deep_h).toBe(2);
  expect(today.sleep_rem_h).toBe(1.5);
  expect(today.sleep_light_h).toBe(4.5);
});

it('builds a workout per ExerciseSession record with detail and source', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.aggregateRecord.mockResolvedValue({});
  mockHC.readRecords.mockImplementation((type: string) => {
    if (type === 'ExerciseSession') return Promise.resolve({ records: [{
      metadata: { id: 'hc-1', dataOrigin: 'com.hevy' },
      exerciseType: 45, title: 'Pull Day', notes: 'Set 1: 54 kg x 12',
      startTime: '2026-08-24T18:00:00.000Z', endTime: '2026-08-24T18:35:00.000Z',
    }] });
    return Promise.resolve({ records: [] });
  });
  const [today] = await readRecentDays(1);
  expect(today.workouts).toHaveLength(1);
  expect(today.workouts![0]).toMatchObject({
    hc_id: 'hc-1', source: 'com.hevy', exercise_type: 45,
    title: 'Pull Day', detail: 'Set 1: 54 kg x 12', duration_min: 35,
  });
});
