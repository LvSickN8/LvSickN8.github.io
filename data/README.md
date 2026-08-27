# 数据目录

所有上传与保存的文件都按类型自动分类、按日期自动命名，再同步到 GitHub。

```text
data/
  profile/profile.json
  diary/YYYY-MM-DD-slug.md
  gallery/gallery.json
  gallery/originals/
  gallery/thumbnails/
  music/tracks.json
  music/files/
  mood/mood.json
  timeline/timeline.json
  knowledge/nodes.json
  capsule/capsules.json
  notes/notes.json
  map/map.json
  ai/echoes.json
  private/
```

## 自动命名

- 日记：`2026-08-25-moonlight.md`
- 照片：`2026-08-25-window-light.jpg`
- 心情：写入 `mood.json` 的 entries 数组
- 时间胶囊：写入 `capsule/capsules.json`

## 可见性

- `public`：主页、公开日记、公开照片
- `draft`：仅保存在当前浏览器
- `private`：先用设置页 AES-GCM 加密，再上传到私密仓库或 `data/private/`
