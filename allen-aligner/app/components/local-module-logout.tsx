type LocalModule = "finance";

export default function LocalModuleLogout({ module: _module }: { module: LocalModule }) {
  return (
    <form action="/api/hr/logout" method="post">
      <button type="submit">Sign out</button>
    </form>
  );
}
