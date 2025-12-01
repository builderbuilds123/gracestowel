import {
  useDeleteProductType
} from "./chunk-B4GODIOW.mjs";

// src/routes/product-types/common/hooks/use-delete-product-type-action.tsx
import { useNavigate } from "react-router-dom";
import { toast, usePrompt } from "@medusajs/ui";
import { useTranslation } from "react-i18next";
var useDeleteProductTypeAction = (id, value) => {
  const { t } = useTranslation();
  const prompt = usePrompt();
  const navigate = useNavigate();
  const { mutateAsync } = useDeleteProductType(id);
  const handleDelete = async () => {
    const result = await prompt({
      title: t("general.areYouSure"),
      description: t("productTypes.delete.confirmation", { value }),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel")
    });
    if (!result) {
      return;
    }
    await mutateAsync(void 0, {
      onSuccess: () => {
        navigate("/settings/product-types", { replace: true });
        toast.success(t("productTypes.delete.successToast", { value }));
      },
      onError: (e) => {
        toast.error(e.message);
      }
    });
  };
  return handleDelete;
};

export {
  useDeleteProductTypeAction
};
