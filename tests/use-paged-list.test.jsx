import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { usePagedList } from '../src/react/lists/index.js';

afterEach(cleanup);

const getItemId = (item) => item.id;

function Harness({ acceptItems, fetchPage }) {
  const { content, filter, loadMore } = usePagedList({
    acceptItems,
    fetchPage,
    pageSize: 2,
    getItemId,
  });

  useEffect(() => { filter(); }, [filter]);

  return (
    <div>
      <button type="button" onClick={() => filter()}>reset</button>
      <button type="button" onClick={() => loadMore()}>more</button>
      <output data-testid="items">{content.items.map((item) => item.id).join(',')}</output>
      <output data-testid="page">{content.pagesLoaded}</output>
    </div>
  );
}

function ReplacementHarness({ fetchPage, controls }) {
  const list = usePagedList({ fetchPage, pageSize: 2, getItemId });
  controls.current = list;
  useEffect(() => { list.filter(); }, [list.filter]);
  return (
    <div>
      <output data-testid="replacement-items">
        {list.content.items.map((item) => item.id).join(',')}
      </output>
      <output data-testid="replacement-loading">{String(list.content.loading)}</output>
      <output data-testid="replacement-total">{String(list.content.serverTotal)}</output>
    </div>
  );
}

function RefreshHarness({ fetchPage }) {
  const { content, filter, refresh } = usePagedList({ fetchPage, pageSize: 2, getItemId });
  useEffect(() => { filter(); }, [filter]);
  return (
    <div>
      <button type="button" onClick={() => filter()}>filter</button>
      <button type="button" onClick={() => refresh()}>refresh</button>
      <output data-testid="refresh-loaded">{String(content.loaded)}</output>
      <output data-testid="refresh-loading">{String(content.loading)}</output>
      <ul>
        {content.items.map((item) => (
          <li key={item.id} data-testid={`refresh-item-${item.id}`}>{item.id}</li>
        ))}
      </ul>
    </div>
  );
}

describe('usePagedList', () => {
  it('advances by loaded page even when a page has fewer rows than its limit', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ items: [{ id: 'a' }, { id: 'b' }], total: 3 })
      .mockResolvedValueOnce({ items: [{ id: 'c' }], total: 3 });
    render(<Harness fetchPage={fetchPage} />);

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'more' }));
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));

    expect(fetchPage.mock.calls[0][0]).toMatchObject({ offset: 0, page: 0, limit: 2 });
    expect(fetchPage.mock.calls[1][0]).toMatchObject({ offset: 2, page: 1, limit: 2 });
    expect(screen.getByTestId('items')).toHaveTextContent('a,b,c');
    expect(screen.getByTestId('page')).toHaveTextContent('2');
  });

  it('ignores a superseded response after a second reset and does not publish it', async () => {
    const pending = [];
    const fetchPage = vi.fn(() => new Promise((resolve) => pending.push(resolve)));
    const acceptItems = vi.fn();
    render(<Harness fetchPage={fetchPage} acceptItems={acceptItems} />);

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'reset' }));
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));

    pending[1]({ items: [{ id: 'current' }], total: 1 });
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('current'));
    expect(acceptItems).toHaveBeenCalledWith([{ id: 'current' }], { items: [{ id: 'current' }], total: 1 });
    await act(async () => {
      pending[0]({ items: [{ id: 'stale' }], total: 1 });
      await Promise.resolve();
    });
    expect(screen.getByTestId('items')).toHaveTextContent('current');
    expect(acceptItems).toHaveBeenCalledTimes(1);
  });

  it('publishes the replayed request under StrictMode', async () => {
    const fetchPage = vi.fn(() => Promise.resolve({ items: [{ id: 'strict' }], total: 1 }));
    render(<StrictMode><Harness fetchPage={fetchPage} /></StrictMode>);

    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('strict'));
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('replaces compatibility data and fences the superseded request', async () => {
    let resolveRequest;
    const fetchPage = vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const controls = { current: null };
    render(<ReplacementHarness fetchPage={fetchPage} controls={controls} />);

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    const signal = fetchPage.mock.calls[0][0].signal;
    act(() => {
      controls.current.replaceItems([{ id: 'local' }], {
        serverTotal: 1, hasMore: false, pagesLoaded: 1, loaded: true,
      });
    });
    expect(signal.aborted).toBe(true);
    expect(screen.getByTestId('replacement-items')).toHaveTextContent('local');
    expect(screen.getByTestId('replacement-loading')).toHaveTextContent('false');
    expect(screen.getByTestId('replacement-total')).toHaveTextContent('1');

    await act(async () => {
      resolveRequest({ items: [{ id: 'stale' }], total: 1 });
      await Promise.resolve();
    });
    expect(screen.getByTestId('replacement-items')).toHaveTextContent('local');
  });

  it('keeps rendered rows and loaded state during refresh, then replaces page zero', async () => {
    let resolveRefresh;
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ items: [{ id: 'old' }], total: 1 })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    render(<RefreshHarness fetchPage={fetchPage} />);

    await waitFor(() => expect(screen.getByTestId('refresh-item-old')).toBeInTheDocument());
    const oldRow = screen.getByTestId('refresh-item-old');
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('refresh-item-old')).toBe(oldRow);
    expect(screen.getByTestId('refresh-loaded')).toHaveTextContent('true');
    expect(screen.getByTestId('refresh-loading')).toHaveTextContent('true');

    await act(async () => {
      resolveRefresh({ items: [{ id: 'new' }], total: 1 });
      await Promise.resolve();
    });
    expect(screen.queryByTestId('refresh-item-old')).not.toBeInTheDocument();
    expect(screen.getByTestId('refresh-item-new')).toBeInTheDocument();
    expect(screen.getByTestId('refresh-loading')).toHaveTextContent('false');
  });

  it('clears old rows during filter while its page-zero request is pending', async () => {
    let resolveFilter;
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ items: [{ id: 'old' }], total: 1 })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFilter = resolve; }));
    render(<RefreshHarness fetchPage={fetchPage} />);

    await waitFor(() => expect(screen.getByTestId('refresh-item-old')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'filter' }));

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('refresh-item-old')).not.toBeInTheDocument();
    expect(screen.getByTestId('refresh-loaded')).toHaveTextContent('false');

    await act(async () => {
      resolveFilter({ items: [{ id: 'filtered' }], total: 1 });
      await Promise.resolve();
    });
    expect(screen.getByTestId('refresh-item-filtered')).toBeInTheDocument();
  });
});
