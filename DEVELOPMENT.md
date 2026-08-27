# 浮光开发与验证

## 本地预览

必须通过静态服务器访问，不能直接双击 `index.html`。例如：

```sh
python3 -m http.server 8080
```

然后打开 `http://localhost:8080/`。首次进入默认是访客模式；在登录框填写 GitHub Owner / Repo / Token 后，才能发布、删除和同步。

## 数据与同步

- `data/` 内是 GitHub Pages 可公开读取的数据。只有 `visibility: public` 的日记会写入同步索引；本地草稿不会被同步。
- 本地日记、照片和音乐分别保存在浏览器的 localStorage / IndexedDB。点击“同步本机数据到 GitHub”时，本地照片和音乐会先上传二进制文件，再更新索引。
- 通用“记录此刻”入口上传图片或音频时，会自动进入照片档案或音乐歌单；其他附件会按类别写入 `fuguang.files` 本地记录，配置同步时上传到对应 `data/` 目录。
- 私密文本必须先在设置页加密。GitHub Pages 是公开托管，不能上传明文私密内容。
- GitHub Token 只保存在当前浏览器，不要写入仓库。Token 需要目标仓库 `Contents: Read and write` 权限。

## 发布前校验

```sh
node scripts/verify-project.mjs
```

该脚本会校验所有 JSON、关键 JavaScript 的语法、Service Worker 引用的离线资源、日记索引是否指向实际 Markdown 文件，以及照片 / 音乐索引是否指向仓库内真实资源。
