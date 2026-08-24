import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import BackgroundFetch from 'react-native-background-fetch';
import {runSync} from './src/services/sync';

BackgroundFetch.registerHeadlessTask(async ({taskId}) => {
  await runSync();
  BackgroundFetch.finish(taskId);
});

AppRegistry.registerComponent(appName, () => App);
