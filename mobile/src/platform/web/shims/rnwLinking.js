// Web only (metro.config.js): Linking for the iPhone web build. RNW's, plus
// openSettings, which a page cannot do, so it says where the switch is.
import { Linking as RNWLinking } from 'react-native-web';
import { confirm } from '../../ui/ConfirmDialog';

const Linking = {
  openURL: (url) => RNWLinking.openURL(url),
  canOpenURL: (url) => RNWLinking.canOpenURL(url),
  getInitialURL: () => RNWLinking.getInitialURL(),
  addEventListener: (...a) => RNWLinking.addEventListener(...a),
  removeEventListener: (...a) => RNWLinking.removeEventListener?.(...a),
  sendIntent: async () => {},
  openSettings: async () => {
    await confirm({
      title: 'Allow access',
      message: 'Open Settings › Apps › Safari on your iPhone and allow Camera and Microphone, then try again.',
      confirmLabel: 'OK',
    });
  },
};

export default Linking;
