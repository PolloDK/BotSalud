import BackgroundFetch from 'react-native-background-fetch';
import { runSync } from './services/sync';

const TASK_ID = 'com.botsaludapp.sync';

export const configureBackgroundSync = async (): Promise<void> => {
  await BackgroundFetch.configure(
    {
      minimumFetchInterval: 720,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
      requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
    },
    async (taskId: string) => {
      await runSync();
      BackgroundFetch.finish(taskId);
    },
    (taskId: string) => {
      BackgroundFetch.finish(taskId);
    }
  );

  await BackgroundFetch.scheduleTask({
    taskId: TASK_ID,
    delay: 0,
    periodic: true,
    forceAlarmManager: true,
    stopOnTerminate: false,
    enableHeadless: true,
  });
};
