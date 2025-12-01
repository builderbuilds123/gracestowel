import {
  queryClient
} from "./chunk-FXYH54JP.mjs";
import {
  queryKeysFactory
} from "./chunk-774WSTCC.mjs";
import {
  sdk
} from "./chunk-DEQUVHHE.mjs";

// src/hooks/api/views.tsx
import {
  useMutation,
  useQuery
} from "@tanstack/react-query";
var VIEWS_QUERY_KEY = "views";
var _viewsKeys = queryKeysFactory(VIEWS_QUERY_KEY);
_viewsKeys.columns = function(entity) {
  return [this.all, "columns", entity];
};
_viewsKeys.active = function(entity) {
  return [this.detail(entity), "active"];
};
_viewsKeys.configurations = function(entity, query) {
  const key = [this.all, "configurations", entity];
  if (query !== void 0) {
    key.push(query);
  }
  return key;
};
var viewsQueryKeys = _viewsKeys;
var useEntityColumns = (entity, options) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.admin.views.columns(entity),
    queryKey: viewsQueryKeys.columns(entity),
    ...options
  });
  return { ...data, ...rest };
};
var useViewConfigurations = (entity, query, options) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.admin.views.listConfigurations(entity, query),
    queryKey: viewsQueryKeys.configurations(entity, query),
    ...options
  });
  return { ...data, ...rest };
};
var useActiveViewConfiguration = (entity, options) => {
  const query = useQuery({
    queryFn: () => sdk.admin.views.retrieveActiveConfiguration(entity),
    queryKey: viewsQueryKeys.active(entity),
    ...options
  });
  const { data, ...rest } = query;
  return { ...data, ...rest };
};
var useCreateViewConfiguration = (entity, options) => {
  return useMutation({
    mutationFn: (payload) => sdk.admin.views.createConfiguration(entity, payload),
    ...options,
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: viewsQueryKeys.configurations(entity) });
      if (variables.set_active) {
        queryClient.invalidateQueries({
          queryKey: viewsQueryKeys.active(entity)
        });
      }
      options?.onSuccess?.(data, variables, context);
    }
  });
};
var useUpdateViewConfiguration = (entity, id, options) => {
  return useMutation({
    mutationFn: (payload) => sdk.admin.views.updateConfiguration(entity, id, payload),
    ...options,
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: viewsQueryKeys.configurations(entity) });
      queryClient.invalidateQueries({ queryKey: viewsQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: viewsQueryKeys.active(entity) });
      options?.onSuccess?.(data, variables, context);
    }
  });
};
var useDeleteViewConfiguration = (entity, id, options) => {
  return useMutation({
    mutationFn: () => sdk.admin.views.deleteConfiguration(entity, id),
    ...options,
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: viewsQueryKeys.configurations(entity) });
      queryClient.invalidateQueries({ queryKey: viewsQueryKeys.detail(id) });
      queryClient.invalidateQueries({
        queryKey: viewsQueryKeys.active(entity)
      });
      options?.onSuccess?.(data, variables, context);
    }
  });
};
var useSetActiveViewConfiguration = (entity, options) => {
  return useMutation({
    mutationFn: (viewConfigurationId) => {
      return sdk.admin.views.setActiveConfiguration(entity, {
        view_configuration_id: viewConfigurationId
      });
    },
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({
        queryKey: viewsQueryKeys.active(entity)
      });
      await queryClient.invalidateQueries({ queryKey: viewsQueryKeys.configurations(entity) });
      options?.onSuccess?.(data, variables, context);
    },
    onError: (error, variables, context) => {
      options?.onError?.(error, variables, context);
    }
  });
};

export {
  useEntityColumns,
  useViewConfigurations,
  useActiveViewConfiguration,
  useCreateViewConfiguration,
  useUpdateViewConfiguration,
  useDeleteViewConfiguration,
  useSetActiveViewConfiguration
};
