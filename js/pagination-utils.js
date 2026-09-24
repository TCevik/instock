export function calculatePagination(totalItems, pageSize, requestedPage = 1, loadedCount = null) {
  const safeTotal = Math.max(0, Number(totalItems) || 0);
  const safePageSize = Math.max(1, Number(pageSize) || 1);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));

  let page = Number(requestedPage) || 1;
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;

  const startIndex = (page - 1) * safePageSize;
  const currentItemCount = loadedCount !== null && loadedCount !== undefined
    ? Math.max(0, Number(loadedCount) || 0)
    : Math.max(0, safeTotal - startIndex);

  const endIndex = Math.min(startIndex + currentItemCount, safeTotal);

  return {
    totalPages,
    currentPage: page,
    startIndex,
    endIndex,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export function updatePaginationControls({
  prevBtn = null,
  nextBtn = null,
  currentPage,
  totalPages,
  currentEl = null,
  infoEl = null,
  totalItems = 0,
  startIndex = 0,
  endIndex = 0,
  itemLabel = "items",
}) {
  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
  }
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
  }

  if (currentEl) {
    currentEl.textContent = `Pagina ${currentPage} van ${totalPages}`;
  }

  if (infoEl) {
    if (totalItems === 0) {
      infoEl.textContent = `0 ${itemLabel}`;
    } else {
      infoEl.textContent = `${startIndex + 1}-${endIndex} van ${totalItems} ${itemLabel}`;
    }
  }
}
