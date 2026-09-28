declare module 'react-native-vector-icons/MaterialCommunityIcons' {
  import * as React from 'react';

  export interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: any;
  }

  export default class MaterialCommunityIcons extends React.Component<IconProps> {}
}
