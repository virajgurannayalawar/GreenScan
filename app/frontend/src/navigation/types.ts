import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootTabParamList = {
  Scan: undefined;
  Profile: undefined;
  History: undefined;
};

export type RootParamList = NavigatorScreenParams<RootTabParamList>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootTabParamList {}
  }
}
