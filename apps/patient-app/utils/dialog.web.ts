import type { ConfirmOptions, DialogApi, DialogButton, DialogOptions } from './dialogTypes';
import { enqueueAlert, enqueueConfirm, resolveDialog, subscribeDialogs } from './dialogQueue';

export type { ConfirmOptions, DialogApi, DialogButton, DialogOptions, DialogTone } from './dialogTypes';
export { resolveDialog, subscribeDialogs };

export const dialog: DialogApi = {
  alert(title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions) {
    enqueueAlert(title, message, buttons, options);
  },
  confirm(options: ConfirmOptions) {
    return enqueueConfirm(options);
  },
};

export default dialog;
