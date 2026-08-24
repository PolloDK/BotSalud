import React, { useEffect } from 'react';
import SetupScreen from './src/screens/SetupScreen';
import { checkAndApplyUpdate } from './src/services/updater';

export default function App() {
  useEffect(() => {
    checkAndApplyUpdate();
  }, []);

  return <SetupScreen />;
}
