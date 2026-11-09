/** Open the system file picker for images; the chosen ones are added to the session. */

import { session } from './session.svelte';

export function chooseImages(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'image/*,.heic,.heif';
  input.onchange = () => void session.addFiles(input.files ?? []);
  input.click();
}
