@echo off
chcp 65001 >nul
echo ==========================================
echo   NocoBase 云端数据备份到本地
echo ==========================================
echo.

REM 检查 Git Bash 是否存在
where bash >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到 bash 命令
    echo 请确保已安装 Git for Windows
    pause
    exit /b 1
)

REM 执行备份脚本
bash "%~dp0backup-from-cloud.sh"

echo.
echo 按任意键退出...
pause >nul
