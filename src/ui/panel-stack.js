function restack(panels) {
  for (let index = 0; index < panels.length; index += 1) {
    // The legacy application ran as a sloppy classic script, where a refused
    // property write did not throw. Reflect.set retains that edge-case while
    // this implementation runs in strict ES-module code.
    Reflect.set(panels[index].style, 'zIndex', String(300 + index));
  }
}

export function createPanelStack(initialPanels) {
  const panels = initialPanels || [];

  function push(panel) {
    const index = panels.indexOf(panel);
    if (index >= 0) panels.splice(index, 1);
    panels.push(panel);
    restack(panels);
  }

  function remove(panel) {
    const index = panels.indexOf(panel);
    if (index >= 0) panels.splice(index, 1);
    restack(panels);
  }

  function top() {
    return panels[panels.length - 1];
  }

  function isEmpty() {
    return !panels.length;
  }

  function isTopOrEmpty(panel) {
    return isEmpty() || top() === panel;
  }

  return Object.freeze({ push, remove, top, isEmpty, isTopOrEmpty });
}
