// 数据定义
const contacts = [
  { username: "telegram" },
  { username: "durov" },
  { username: "example1" },
  { username: "example2" }
];
const groups = [
  { username: "telegramgroup1" },
  { username: "telegramgroup2" },
  { username: "telegramgroup3" }
];
const channels = [
  { username: "channelAlpha" },
  { username: "channelBeta" },
  { username: "channelGamma" },
  { username: "channelDelta" }
];
const library = [
  { category: "PC", title: "Windows超长软件名字演示换行效果，看看如何自动换行", url: "#" },
  { category: "PC", title: "Mac版软件", url: "#" },
  { category: "Android", title: "安卓应用A", url: "#" },
  { category: "Android", title: "安卓应用B", url: "#" },
  { category: "IOS", title: "iOS应用甲", url: "#" },
  { category: "IOS", title: "iOS应用乙", url: "#" }
];

// 创建联系人/群组/频道卡片
function createUserCard({ username }) {
  const card = document.createElement("a");
  card.className = "card";
  card.href = `https://t.me/${username}`;
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.setAttribute("aria-label", username + " Telegram 链接");

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  const img = document.createElement("img");
  img.src = `https://unavatar.io/telegram/${username}`;
  img.alt = username + " 头像";
  avatar.appendChild(img);
  card.appendChild(avatar);

  const info = document.createElement("div");
  info.className = "info";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = username;
  info.appendChild(name);

  card.appendChild(info);
  return card;
}

// 创建软件库卡片
function createLibraryCard({ category, title, url }) {
  const card = document.createElement("a");
  card.className = "card";
  card.href = url;
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.setAttribute("aria-label", title + " 下载链接");

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.backgroundColor = "#c7d2fe";
  avatar.style.color = "#4338ca";
  avatar.textContent = category.charAt(0).toUpperCase();

  card.appendChild(avatar);

  const info = document.createElement("div");
  info.className = "info";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = title;
  info.appendChild(name);

  card.appendChild(info);
  return card;
}

// 渲染列表的通用函数
function renderList(containerId, data, createFn) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  data.forEach(item => {
    container.appendChild(createFn(item));
  });
}

renderList("contactsList", contacts, createUserCard);
renderList("groupsList", groups, createUserCard);
renderList("channelsList", channels, createUserCard);
renderList("libraryList", library, createLibraryCard);

// 菜单和遮罩交互
const menuBtn = document.querySelector(".menu");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");

function openSidebar() {
  sidebar.classList.add("open");
  sidebar.set