// Platform selection controls navigation; roles only grant management access.
const platforms = {
  user: { label: "用户平台", home: "/app", login: "/login", account: "/account", forgot: "/forgot-password" },
  admin: { label: "管理平台", home: "/admin", login: "/admin/login", account: "/admin/account", forgot: "/admin/forgot-password" },
};

export const canManage = (user) => ["admin", "editor"].includes(user?.role);
export const getPlatform = (platform = "user") => platforms[platform] || platforms.user;

export function loginDestination(user, platform = "user") {
  if (platform === "admin" && !canManage(user)) {
    throw new Error("该账号没有管理权限，请前往用户平台登录。");
  }
  return getPlatform(platform).home;
}

export function completeLogin(result, { platform = "user", saveToken, onSuccess, navigate }) {
  // Check access before replacing an existing session. Embedded purchase login
  // keeps its callback instead of navigating away from the current course.
  const destination = loginDestination(result.user, platform);
  saveToken(result.token);
  if (onSuccess) onSuccess(result.user);
  else navigate?.(destination);
}
