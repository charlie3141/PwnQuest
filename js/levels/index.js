/* ============================================================
 * PwnQuest — registry các level + boot
 * Các file level*.js tự đăng ký bằng PwnQuest.levels.push(...)
 * ============================================================ */
window.PwnQuest = window.PwnQuest || {};
PwnQuest.levels = PwnQuest.levels || [];

document.addEventListener('DOMContentLoaded', function () {
  PwnQuest.App.init();
});
