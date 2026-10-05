/**
 * Entry point.
 *
 * `react-native-gesture-handler` must be the very first import in the bundle —
 * it patches the native touch pipeline, and anything that mounts before it will
 * not receive gesture events. The pinch/pan on the Skia canvas depends on this.
 */
import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
