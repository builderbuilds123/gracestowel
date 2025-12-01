// src/components/common/infinite-list/infinite-list.tsx
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "@medusajs/ui";
import { Spinner } from "@medusajs/icons";
import { jsx, jsxs } from "react/jsx-runtime";
var InfiniteList = ({
  queryKey,
  queryFn,
  queryOptions,
  renderItem,
  renderEmpty,
  responseKey,
  pageSize = 20
}) => {
  const {
    data,
    error,
    fetchNextPage,
    fetchPreviousPage,
    hasPreviousPage,
    hasNextPage,
    isFetching,
    isPending
  } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = 0 }) => {
      return await queryFn({
        limit: pageSize,
        offset: pageParam
      });
    },
    initialPageParam: 0,
    maxPages: 5,
    getNextPageParam: (lastPage) => {
      const moreItemsExist = lastPage.count > lastPage.offset + lastPage.limit;
      return moreItemsExist ? lastPage.offset + lastPage.limit : void 0;
    },
    getPreviousPageParam: (firstPage) => {
      const moreItemsExist = firstPage.offset !== 0;
      return moreItemsExist ? Math.max(firstPage.offset - firstPage.limit, 0) : void 0;
    },
    ...queryOptions
  });
  const items = useMemo(() => {
    return data?.pages.flatMap((p) => p[responseKey]) ?? [];
  }, [data, responseKey]);
  const parentRef = useRef(null);
  const startObserver = useRef();
  const endObserver = useRef();
  const fetchNextPageRef = useRef(fetchNextPage);
  const fetchPreviousPageRef = useRef(fetchPreviousPage);
  useEffect(() => {
    fetchNextPageRef.current = fetchNextPage;
    fetchPreviousPageRef.current = fetchPreviousPage;
  }, [fetchNextPage, fetchPreviousPage]);
  useEffect(() => {
    if (isPending) {
      return;
    }
    if (!isFetching) {
      startObserver.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasPreviousPage) {
            startObserver.current?.disconnect();
            fetchPreviousPageRef.current();
          }
        },
        {
          threshold: 0.5
        }
      );
      endObserver.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage) {
            endObserver.current?.disconnect();
            fetchNextPageRef.current();
          }
        },
        {
          threshold: 0.5
        }
      );
      if (parentRef.current?.firstChild) {
        startObserver.current?.observe(parentRef.current.firstChild);
      }
      if (parentRef.current?.lastChild) {
        endObserver.current?.observe(parentRef.current.lastChild);
      }
    }
    return () => {
      startObserver.current?.disconnect();
      endObserver.current?.disconnect();
    };
  }, [
    hasNextPage,
    hasPreviousPage,
    isFetching,
    isPending
  ]);
  useEffect(() => {
    if (error) {
      toast.error(error.message);
    }
  }, [error]);
  if (isPending) {
    return /* @__PURE__ */ jsx("div", { className: "flex h-full flex-col items-center justify-center", children: /* @__PURE__ */ jsx(Spinner, { className: "animate-spin" }) });
  }
  return /* @__PURE__ */ jsxs("div", { ref: parentRef, className: "h-full", children: [
    items?.length ? items.map((item) => /* @__PURE__ */ jsx("div", { children: renderItem(item) }, item.id)) : renderEmpty(),
    isFetching && /* @__PURE__ */ jsx("div", { className: "flex flex-col items-center justify-center py-4", children: /* @__PURE__ */ jsx(Spinner, { className: "animate-spin" }) })
  ] });
};

export {
  InfiniteList
};
