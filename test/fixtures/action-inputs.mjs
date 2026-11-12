// action.yml の入力の名前と既定値。Actions は、ワークフローに書いていない入力に、この既定値を渡す。
// 引用符で囲んだ既定値 ('true' など) は、引用符を外して返す。
import { readFileSync } from 'node:fs';

export function actionInputs() {
  const yaml = readFileSync(new URL('../../action.yml', import.meta.url), 'utf8');
  const inputs = [...yaml.matchAll(/^ {2}([\w-]+):\n {4}description: .*\n {4}default: (.*)$/gm)];
  return Object.fromEntries(inputs.map(([, name, value]) => [name, value.replace(/^'(.*)'$/, '$1')]));
}
