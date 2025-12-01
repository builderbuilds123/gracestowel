import {
  useQueryParams
} from "./chunk-C76H5USB.mjs";

// src/hooks/table/query/use-collection-table-query.tsx
var useCollectionTableQuery = ({
  prefix,
  pageSize = 20
}) => {
  const queryObject = useQueryParams(
    ["offset", "q", "order", "created_at", "updated_at"],
    prefix
  );
  const { offset, created_at, updated_at, q, order } = queryObject;
  const searchParams = {
    limit: pageSize,
    offset: offset ? Number(offset) : 0,
    order,
    created_at: created_at ? JSON.parse(created_at) : void 0,
    updated_at: updated_at ? JSON.parse(updated_at) : void 0,
    q
  };
  return {
    searchParams,
    raw: queryObject
  };
};

// src/hooks/table/query/use-product-tag-table-query.tsx
var useProductTagTableQuery = ({
  prefix,
  pageSize = 20
}) => {
  const queryObject = useQueryParams(
    ["offset", "q", "order", "created_at", "updated_at"],
    prefix
  );
  const { offset, q, order, created_at, updated_at } = queryObject;
  const searchParams = {
    limit: pageSize,
    offset: offset ? Number(offset) : 0,
    order,
    created_at: created_at ? JSON.parse(created_at) : void 0,
    updated_at: updated_at ? JSON.parse(updated_at) : void 0,
    q
  };
  return {
    searchParams,
    raw: queryObject
  };
};

// src/hooks/table/query/use-refund-reason-table-query.tsx
var useRefundReasonTableQuery = ({
  prefix,
  pageSize = 20
}) => {
  const queryObject = useQueryParams(
    ["offset", "q", "order", "created_at", "updated_at"],
    prefix
  );
  const { offset, q, order, created_at, updated_at } = queryObject;
  const searchParams = {
    limit: pageSize,
    offset: offset ? Number(offset) : 0,
    order,
    created_at: created_at ? JSON.parse(created_at) : void 0,
    updated_at: updated_at ? JSON.parse(updated_at) : void 0,
    q
  };
  return {
    searchParams,
    raw: queryObject
  };
};

// src/hooks/table/query/use-return-reason-table-query.tsx
var useReturnReasonTableQuery = ({
  prefix,
  pageSize = 20
}) => {
  const queryObject = useQueryParams(
    ["offset", "q", "order", "created_at", "updated_at"],
    prefix
  );
  const { offset, q, order, created_at, updated_at } = queryObject;
  const searchParams = {
    limit: pageSize,
    offset: offset ? Number(offset) : 0,
    order,
    created_at: created_at ? JSON.parse(created_at) : void 0,
    updated_at: updated_at ? JSON.parse(updated_at) : void 0,
    q
  };
  return {
    searchParams,
    raw: queryObject
  };
};

// src/hooks/table/query/use-shipping-option-table-query.tsx
var useShippingOptionTableQuery = ({
  regionId,
  pageSize = 10,
  prefix
}) => {
  const queryObject = useQueryParams(
    [
      "offset",
      "q",
      "order",
      "admin_only",
      "is_return",
      "created_at",
      "updated_at",
      "stock_location_id"
    ],
    prefix
  );
  const {
    offset,
    order,
    q,
    admin_only,
    is_return,
    created_at,
    updated_at,
    stock_location_id
  } = queryObject;
  const searchParams = {
    limit: pageSize,
    offset: offset ? Number(offset) : 0,
    // TODO: We don't allow region_id in the API yet
    // region_id: regionId,
    // TODO: not supported
    // is_return: is_return ? is_return === "true" : undefined,
    // admin_only: admin_only ? admin_only === "true" : undefined,
    q,
    order,
    stock_location_id,
    created_at: created_at ? JSON.parse(created_at) : void 0,
    updated_at: updated_at ? JSON.parse(updated_at) : void 0
  };
  return {
    searchParams,
    raw: queryObject
  };
};

// src/hooks/table/query/use-tax-rate-table-query.tsx
var useTaxRateTableQuery = ({
  prefix,
  pageSize = 20
}) => {
  const queryObject = useQueryParams(
    ["offset", "q", "order", "created_at", "updated_at"],
    prefix
  );
  const { offset, q, order, created_at, updated_at } = queryObject;
  const searchParams = {
    limit: pageSize,
    offset: offset ? Number(offset) : 0,
    order,
    created_at: created_at ? JSON.parse(created_at) : void 0,
    updated_at: updated_at ? JSON.parse(updated_at) : void 0,
    q
  };
  return {
    searchParams,
    raw: queryObject
  };
};

export {
  useCollectionTableQuery,
  useProductTagTableQuery,
  useRefundReasonTableQuery,
  useReturnReasonTableQuery,
  useShippingOptionTableQuery,
  useTaxRateTableQuery
};
