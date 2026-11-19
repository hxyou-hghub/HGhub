export async function selectCategorySource(page, name) {
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "分类", exact: true }).click();
  await page.getByRole("navigation", { name: "分类片源" }).getByRole("button", { name, exact: true }).click();
}
export async function openRecommendations(page, name) {
  await selectCategorySource(page, name);
  await page.getByRole("button", { name: `推荐分区 · ${name}`, exact: true }).click();
}
export const installedTab = async (page) => {
  const btn = page.getByRole("navigation", { name: "插件中心分栏" }).getByRole("button", { name: /^已安装/ });
  if (await btn.count()) await btn.first().click();
};
export const importTab = async (page) => {
  const btn = page.getByRole("button", { name: "导入与订阅", exact: true });
  if (await btn.count()) await btn.first().click();
};
export const openCodeImport = async (page) => {
  const tab = page.getByRole("tab", { name: "粘贴代码" });
  if (await tab.count()) await tab.click();
  else {
    const summary = page.locator("summary").filter({ hasText: "粘贴代码导入" });
    if (await summary.count()) await summary.click();
  }
};
export const openLocalImport = async (page) => {
  const tab = page.getByRole("tab", { name: "本地文件" });
  if (await tab.count()) await tab.click();
};
export const openOnlineImport = async (page) => {
  const tab = page.getByRole("tab", { name: "在线 URL" });
  if (await tab.count()) await tab.click();
};

export const waitForPluginReady = async (target) => {
  if (target.locator) {
    const readyArticle = target.locator("article.hpp-plugin[data-status='ready'], article.hpp-plugin[data-status='unloaded']");
    if (await readyArticle.count()) {
      await readyArticle.first().waitFor();
      return;
    }
    const readyAttr = target.locator("[data-status='ready'], [data-status='unloaded']");
    if (await readyAttr.count()) {
      await readyAttr.first().waitFor();
      return;
    }
  }
  if (target.getByRole) {
    const btn = target.getByRole("button", { name: "设置与日志", exact: true });
    if (await btn.count()) {
      await btn.first().waitFor();
      return;
    }
  }
  if (target.getByText) {
    const text = target.getByText("已就绪");
    if (await text.count()) {
      await text.first().waitFor();
    }
  }
};

export async function playerPanel(page, panel) {
  const heading = page.locator('.legacy-panel-heading');
  if (await heading.count()) await heading.getByRole('button', {name: panel, exact: true}).click();
  else if (panel === '详情') await page.getByRole('button', {name: /查看详情/}).click();
  else await page.getByRole('button', {name: panel, exact: true}).click();
}
export async function chooseEpisode(page, name) {
  await playerPanel(page, '选集');
  await page.getByRole('button', {name, exact: true}).click();
  await playerPanel(page, '播放设置');
}
