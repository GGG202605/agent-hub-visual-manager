import { useState } from 'react';
import { Save } from 'lucide-react';
import { DEFAULT_SERVER_URL } from '../lib/serverBridge';

/**
 * v1.0 设置面板：默认服务地址 / 默认推演速度。
 * 仅保存非敏感项到 localStorage（API Key 永不落盘）；新值下次启动生效。
 */

export function readStoredSpeed(): 1 | 2 {
  try {
    return window.localStorage.getItem('ahvm.speed') === '2' ? 2 : 1;
  } catch {
    return 1;
  }
}

export function SettingsPanel() {
  const [serverUrl, setServerUrl] = useState(() => {
    try {
      return window.localStorage.getItem('ahvm.serverUrl') || DEFAULT_SERVER_URL;
    } catch {
      return DEFAULT_SERVER_URL;
    }
  });
  const [speed, setSpeed] = useState<1 | 2>(readStoredSpeed);
  const [message, setMessage] = useState('');

  function handleSave() {
    try {
      window.localStorage.setItem('ahvm.serverUrl', serverUrl.trim() || DEFAULT_SERVER_URL);
      window.localStorage.setItem('ahvm.speed', String(speed));
      setMessage('已保存。服务地址下次启动生效；推演速度下次推演生效。');
    } catch {
      setMessage('保存失败：浏览器禁用了本地存储。');
    }
  }

  return (
    <div className="settings-panel">
      <label>
        <span>默认本地服务地址</span>
        <input
          type="text"
          value={serverUrl}
          onChange={(event) => setServerUrl(event.target.value)}
          placeholder={DEFAULT_SERVER_URL}
        />
      </label>

      <label>
        <span>默认推演速度</span>
        <div className="settings-speed">
          <button type="button" className={speed === 1 ? 'is-on' : ''} onClick={() => setSpeed(1)}>
            ×1 常速
          </button>
          <button type="button" className={speed === 2 ? 'is-on' : ''} onClick={() => setSpeed(2)}>
            ×2 加速
          </button>
        </div>
      </label>

      <button type="button" className="plaza-submit settings-save" onClick={handleSave}>
        <Save aria-hidden="true" />
        保存设置
      </button>
      {message ? <p className="settings-msg">{message}</p> : null}

      <p className="settings-note">
        说明：设置仅保存非敏感项（不含任何 API Key）。智能体密钥始终只存页面内存，刷新即清空。
      </p>
    </div>
  );
}
