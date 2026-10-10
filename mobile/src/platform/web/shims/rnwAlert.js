// Web only (metro.config.js): Alert for the iPhone web build. RNW's
// Alert.alert does nothing, so a confirm such as "Transfer to Asha?" would
// silently never happen. This opens the app's own dialog (ui/ConfirmDialog)
// instead: a "cancel" button maps to its Cancel, the other one to its
// confirm button.
import { confirm } from '../../ui/ConfirmDialog';

function alert(title, message, buttons) {
  const list = Array.isArray(buttons) && buttons.length ? buttons : [{ text: 'OK' }];
  const cancel = list.find((b) => b.style === 'cancel') || (list.length > 1 ? list[0] : null);
  const action = list.find((b) => b !== cancel) || list[0];
  confirm({
    title: title == null ? '' : String(title),
    message: message == null ? '' : String(message),
    confirmLabel: action.text || 'OK',
    cancelLabel: cancel?.text,
    destructive: action.style === 'destructive',
  }).then((ok) => {
    if (ok || !cancel) action.onPress?.();
    else cancel.onPress?.();
  });
}

const Alert = { alert, prompt: (title, message) => alert(title, message) };

export default Alert;
