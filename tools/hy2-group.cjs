'use strict';

/**
 * Add a manually selectable HY2 group with its own url-test child.
 * Only proxies whose actual Mihomo protocol is hysteria2 qualify.
 *
 * This function is also serialized into generated JS, so it must remain
 * self-contained and use only the upstream MyClash runtime helpers.
 */
function addHy2Group(config) {
  if (!config || !Array.isArray(config.proxies) || !Array.isArray(config['proxy-groups'])) {
    throw Error('HY2 group requires proxy and group arrays');
  }
  if (
    typeof selectBaseOption !== 'object' ||
    !selectBaseOption ||
    typeof urlTestBaseOption !== 'object' ||
    !urlTestBaseOption ||
    typeof getMatchedRegions !== 'function' ||
    typeof toMatchableName !== 'function'
  ) {
    throw Error('HY2 group requires upstream region and strategy helpers');
  }

  const selectedRegions = new Set(['美国', '新加坡', '台湾']);
  const koreanName =
    /🇰🇷|韩国|韓國|南韩|南韓|한국|首尔|首爾|釜山|仁川|(?<![A-Za-z])(?:KR|KOR|KOREA|SEOUL|BUSAN|INCHEON)(?![A-Za-z])/i;
  const eligible = [];
  const seen = new Set();
  for (const proxy of config.proxies) {
    if (
      !proxy ||
      typeof proxy.name !== 'string' ||
      typeof proxy.type !== 'string' ||
      proxy.type.trim().toLowerCase() !== 'hysteria2'
    ) {
      continue;
    }
    const originalRegions = getMatchedRegions(proxy.name);
    const allowed =
      originalRegions.some((region) => selectedRegions.has(region.name)) ||
      koreanName.test(toMatchableName(proxy.name));
    if (allowed && !seen.has(proxy.name)) {
      seen.add(proxy.name);
      eligible.push(proxy.name);
    }
  }

  // An empty url-test group is invalid in Mihomo. Do not expose a broken selector.
  if (eligible.length === 0) return;

  const selectName = 'HY2优选';
  const autoName = 'HY2-自动选择';
  const groups = config['proxy-groups'];
  const defaultGroup = groups.find((group) => group && group.name === '默认代理');
  const globalGroup = groups.find((group) => group && group.name === 'GLOBAL');
  if (!defaultGroup || !Array.isArray(defaultGroup.proxies) || !globalGroup || !Array.isArray(globalGroup.proxies)) {
    throw Error('HY2 group requires existing 默认代理 and GLOBAL groups');
  }
  const reserved = new Set([selectName, autoName]);
  if (
    groups.some((group) => group && reserved.has(group.name)) ||
    config.proxies.some((proxy) => proxy && reserved.has(proxy.name))
  ) {
    throw Error('HY2 group name collides with an existing group or node');
  }

  const manual = {
    ...selectBaseOption,
    name: selectName,
    type: 'select',
    proxies: [...eligible, autoName],
    'default-selected': autoName,
    hidden: false,
  };
  const automatic = {
    ...urlTestBaseOption,
    name: autoName,
    type: 'url-test',
    proxies: [...eligible],
    hidden: true,
  };
  const geminiIndex = groups.findIndex((group) => group && group.name === 'Gemini Web');
  const defaultIndex = groups.findIndex((group) => group && group.name === '默认代理');
  groups.splice((geminiIndex >= 0 ? geminiIndex : defaultIndex) + 1, 0, manual, automatic);

  // Make the new group opt-in. Do not change the current 默认代理 selection.
  if (!defaultGroup.proxies.includes(selectName)) defaultGroup.proxies.push(selectName);
  if (!globalGroup.proxies.includes(selectName)) globalGroup.proxies.push(selectName);
}

module.exports = { addHy2Group };
