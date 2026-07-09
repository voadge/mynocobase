# 工作规范

## 核心原则：服务器是唯一数据源

本项目的文件以生产服务器（`ubuntu@110.42.236.231:/opt/noco-base/`）为准。
本地 Git 仓库仅作备份快照，禁止作为修改起点。

## 禁区

- **严禁**修改本地文件后推送到服务器
- **严禁**本地编辑 `dashboard/`、`nginx.conf`、`docker-compose.yml`、`nocobase.conf`、`env/` 下的文件作为修改手段
- **严禁**在本地新增或修改插件代码后主动部署

## 正确流程

```
服务器修改 → 测试验证 → sync 回本地备份 → git commit
```

1. **SSH 到服务器**直接在服务器上修改
2. **验证修改**在浏览器确认功能正常
3. **本地备份**运行 `.\sync-from-server.ps1` 拉回变更
4. **提交**将变更提交到 Git 仓库

## 例外

- `AGENTS.md`、`CONFIG.md` 等文档类文件可以直接在本地编辑并提交
- `sync-from-server.sh` / `sync-from-server.ps1` 可以在本地修改
