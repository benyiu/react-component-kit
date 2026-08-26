// What the shell's lazy accessors carry, carried the React way.
//
// The module tree's convention is that nothing imports its collaborators;
// everything arrives through a deps object. A context provider is the same
// convention with a different delivery mechanism, so components stay as
// testable as the modules they replace: render them under a provider holding
// fakes and no global has to be stubbed.
import { createContext, useContext, useSyncExternalStore } from 'react';

const DepsContext = createContext(null);

function DepsProvider({ value, children }) {
  return <DepsContext.Provider value={value}>{children}</DepsContext.Provider>;
}

function useDeps() {
  const deps = useContext(DepsContext);
  if (!deps) throw new Error('useDeps requires a <DepsProvider>');
  return deps;
}

// Language is not React state, so a component that merely called t() would
// keep the strings it first rendered. The classic side already broadcasts
// setLang through subscribeLanguageRefresh — the same signal that reruns
// applyI18n over shell-owned DOM — so React subscribes to it and re-renders
// on exactly the same event. That is why `t` must be read through this hook
// and never captured in a closure or a memo dependency list.
function useLanguage() {
  const { subscribeLanguage, getLanguage } = useDeps();
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
}

function useT() {
  const { t } = useDeps();
  useLanguage();
  return t;
}

export { DepsContext, DepsProvider, useDeps, useLanguage, useT };
