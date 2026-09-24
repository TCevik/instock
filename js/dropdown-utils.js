export function resetDropdownPosition(dropdown) {
  if (!dropdown) return;
  dropdown.style.position = "";
  dropdown.style.margin = "";
  dropdown.style.top = "";
  dropdown.style.bottom = "";
  dropdown.style.left = "";
  dropdown.style.right = "";
  dropdown.style.transform = "";
  dropdown.style.maxHeight = "";
  dropdown.style.maxWidth = "";
  dropdown.style.minWidth = "";
}

export function keepInViewport(dropdown, anchor = null) {
  if (!dropdown) return;

  const anchorEl = anchor || dropdown.parentElement;
  if (!anchorEl) return;

  dropdown.style.position = "fixed";
  dropdown.style.margin = "0";
  dropdown.style.top = "0";
  dropdown.style.left = "0";
  dropdown.style.right = "auto";
  dropdown.style.bottom = "auto";
  dropdown.style.transform = "none";
  dropdown.style.maxHeight = "none";
  dropdown.style.maxWidth = "none";

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 10;

  const anchorRect = anchorEl.getBoundingClientRect();
  
  const originalDisplay = dropdown.style.display;
  dropdown.style.display = 'flex';
  
  // Ensure dropdown is at least as wide as the anchor
  dropdown.style.minWidth = `${anchorRect.width}px`;
  
  const rect = dropdown.getBoundingClientRect();
  dropdown.style.display = originalDisplay;

  const dropdownHeight = rect.height || 200;
  const dropdownWidth = Math.max(rect.width || 280, anchorRect.width);

  const spaceBelow = viewportHeight - anchorRect.bottom - margin;
  const spaceAbove = anchorRect.top - margin;

  if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
    dropdown.style.top = "auto";
    dropdown.style.bottom = `${viewportHeight - anchorRect.top + 4}px`;
    if (spaceAbove < dropdownHeight) {
      dropdown.style.maxHeight = `${Math.max(100, Math.floor(spaceAbove) - 6)}px`;
      dropdown.style.overflowY = "auto";
    }
  } else {
    dropdown.style.top = `${anchorRect.bottom + 4}px`;
    dropdown.style.bottom = "auto";
    if (spaceBelow < dropdownHeight) {
      dropdown.style.maxHeight = `${Math.max(100, Math.floor(spaceBelow) - 6)}px`;
      dropdown.style.overflowY = "auto";
    }
  }

  let left = anchorRect.left;
  if (left + dropdownWidth > viewportWidth - margin) {
    left = anchorRect.right - dropdownWidth;
  }
  if (left < margin) {
    left = margin;
  }
  
  dropdown.style.left = `${left}px`;
  dropdown.style.right = "auto";
  dropdown.style.maxWidth = `calc(${viewportWidth}px - ${margin * 2}px)`;
}

export function bindViewportCheck(dropdown, anchor = null) {
  const handler = (e) => {
    if (dropdown.classList.contains("active")) {
      if (e && e.type === "scroll" && e.target && (e.target === dropdown || dropdown.contains(e.target))) {
        return;
      }
      keepInViewport(dropdown, anchor);
    }
  };
  window.addEventListener("resize", handler, { passive: true });
  window.addEventListener("scroll", handler, { passive: true, capture: true });
}
