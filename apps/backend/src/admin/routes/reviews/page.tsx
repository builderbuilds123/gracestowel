import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import {
  createDataTableColumnHelper,
  Container,
  DataTable,
  useDataTable,
  Heading,
  StatusBadge,
  Toaster,
  DataTablePaginationState,
  DataTableRowSelectionState,
  createDataTableCommandHelper,
  toast,
  Button,
  Textarea,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { sdk } from "../../lib/sdk"

type Review = {
  id: string
  title: string
  content: string
  rating: number
  product_id: string
  customer_id?: string
  customer_name: string
  customer_email?: string
  verified_purchase: boolean
  status: "pending" | "approved" | "rejected"
  helpful_count: number
  admin_response?: string | null
  created_at: string
  updated_at: string
}

const commandHelper = createDataTableCommandHelper()

const limit = 20

const ReviewsPage = () => {
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageSize: limit,
    pageIndex: 0,
  })
  const [rowSelection, setRowSelection] = useState<DataTableRowSelectionState>({})
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("all")
  const [editingResponse, setEditingResponse] = useState<string | null>(null)
  const [responseContent, setResponseContent] = useState("")
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false)

  const columnHelper = createDataTableColumnHelper<Review>()

  const columns = useMemo(
    () => [
      columnHelper.select(),
      columnHelper.accessor("id", {
        header: "ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.id.slice(0, 8)}...</span>
        ),
      }),
      columnHelper.accessor("title", {
        header: "Title",
        cell: ({ row }) => (
          <div className="max-w-xs truncate" title={row.original.title}>
            {row.original.title}
          </div>
        ),
      }),
      columnHelper.accessor("rating", {
        header: "Rating",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <span className="font-medium">{row.original.rating}</span>
            <span className="text-gray-400">★</span>
          </div>
        ),
      }),
      columnHelper.accessor("content", {
        header: "Content",
        cell: ({ row }) => (
          <div className="max-w-md truncate text-sm text-gray-600" title={row.original.content}>
            {row.original.content}
          </div>
        ),
      }),
      columnHelper.accessor("customer_name", {
        header: "Customer",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.customer_name}</div>
            {row.original.verified_purchase && (
              <span className="text-xs text-green-600">Verified Purchase</span>
            )}
          </div>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: ({ row }) => {
          const color =
            row.original.status === "approved"
              ? "green"
              : row.original.status === "rejected"
              ? "red"
              : "grey"
          return (
            <StatusBadge color={color}>
              {row.original.status.charAt(0).toUpperCase() + row.original.status.slice(1)}
            </StatusBadge>
          )
        },
      }),
      columnHelper.accessor("product_id", {
        header: "Product",
        cell: ({ row }) => (
          <a
            href={`/products/${row.original.product_id}`}
            className="text-blue-600 hover:underline text-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            View Product
          </a>
        ),
      }),
      columnHelper.accessor("created_at", {
        header: "Created",
        cell: ({ row }) => {
          const date = new Date(row.original.created_at)
          return <span className="text-sm text-gray-600">{date.toLocaleDateString()}</span>
        },
      }),
      columnHelper.accessor("admin_response", {
        header: "Admin Response",
        cell: ({ row }) => {
          if (row.original.admin_response) {
            return (
              <div className="max-w-xs">
                <span className="text-xs text-green-600 font-medium">Has Response</span>
                <div
                  className="text-xs text-gray-500 truncate mt-1"
                  title={row.original.admin_response}
                >
                  {row.original.admin_response}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingResponse(row.original.id)
                    setResponseContent(row.original.admin_response || "")
                  }}
                  className="text-xs text-blue-600 hover:underline mt-1"
                >
                  Edit
                </button>
              </div>
            )
          }
          return (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingResponse(row.original.id)
                setResponseContent("")
              }}
              className="text-xs text-blue-600 hover:underline"
            >
              Add Response
            </button>
          )
        },
      }),
    ],
    [columnHelper]
  )

  const offset = useMemo(() => {
    return pagination.pageIndex * limit
  }, [pagination])

  const { data, isLoading, refetch } = useQuery<{
    reviews: Review[]
    count: number
    limit: number
    offset: number
  }>({
    queryKey: ["reviews", offset, limit, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
      })
      if (statusFilter !== "all") {
        params.append("status", statusFilter)
      }

      const response = (await sdk.client.fetch(`/admin/reviews?${params.toString()}`)) as Response
      if (!response.ok) {
        throw new Error("Failed to fetch reviews")
      }
      return (await response.json()) as {
        reviews: Review[]
        count: number
        limit: number
        offset: number
      }
    },
  })

  const useCommands = (refetch: () => void) => {
    return [
      commandHelper.command({
        label: "Approve",
        shortcut: "A",
        action: async (selection) => {
          const reviewsToApproveIds = Object.keys(selection)

          try {
            const response = (await sdk.client.fetch("/admin/reviews/batch", {
              method: "POST",
              body: {
                ids: reviewsToApproveIds,
                action: "approve",
              },
            })) as Response

            if (!response.ok) {
              throw new Error("Failed to approve reviews")
            }

            toast.success("Reviews approved")
            setRowSelection({})
            refetch()
          } catch (error) {
            toast.error("Failed to approve reviews")
          }
        },
      }),
      commandHelper.command({
        label: "Reject",
        shortcut: "R",
        action: async (selection) => {
          const reviewsToRejectIds = Object.keys(selection)

          try {
            const response = (await sdk.client.fetch("/admin/reviews/batch", {
              method: "POST",
              body: {
                ids: reviewsToRejectIds,
                action: "reject",
              },
            })) as Response

            if (!response.ok) {
              throw new Error("Failed to reject reviews")
            }

            toast.success("Reviews rejected")
            setRowSelection({})
            refetch()
          } catch (error) {
            toast.error("Failed to reject reviews")
          }
        },
      }),
      commandHelper.command({
        label: "Delete",
        shortcut: "D",
        action: async (selection) => {
          const reviewsToDeleteIds = Object.keys(selection)

          if (!confirm(`Are you sure you want to delete ${reviewsToDeleteIds.length} review(s)?`)) {
            return
          }

          try {
            const response = (await sdk.client.fetch("/admin/reviews/batch", {
              method: "POST",
              body: {
                ids: reviewsToDeleteIds,
                action: "delete",
              },
            })) as Response

            if (!response.ok) {
              throw new Error("Failed to delete reviews")
            }

            toast.success("Reviews deleted")
            setRowSelection({})
            refetch()
          } catch (error) {
            toast.error("Failed to delete reviews")
          }
        },
      }),
    ]
  }

  const commands = useCommands(refetch)

  const handleResponseSubmit = async (reviewId: string) => {
    if (!responseContent.trim()) {
      toast.error("Response content cannot be empty")
      return
    }

    setIsSubmittingResponse(true)
    try {
      const review = data?.reviews.find((r) => r.id === reviewId)
      const method = review?.admin_response ? "PUT" : "POST"
      const response = (await sdk.client.fetch(`/admin/reviews/${reviewId}/response`, {
        method,
        body: {
          content: responseContent.trim(),
        },
      })) as Response

      if (!response.ok) {
        throw new Error("Failed to save response")
      }

      toast.success(review?.admin_response ? "Response updated" : "Response added")
      setEditingResponse(null)
      setResponseContent("")
      refetch()
    } catch (error) {
      toast.error("Failed to save response")
    } finally {
      setIsSubmittingResponse(false)
    }
  }

  const handleResponseDelete = async (reviewId: string) => {
    if (!confirm("Are you sure you want to delete this response?")) {
      return
    }

    try {
      const response = (await sdk.client.fetch(`/admin/reviews/${reviewId}/response`, {
        method: "DELETE",
      })) as Response

      if (!response.ok) {
        throw new Error("Failed to delete response")
      }

      toast.success("Response deleted")
      setEditingResponse(null)
      setResponseContent("")
      refetch()
    } catch (error) {
      toast.error("Failed to delete response")
    }
  }

  const table = useDataTable({
    columns,
    data: data?.reviews || [],
    rowCount: data?.count || 0,
    isLoading,
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
    rowSelection: {
      state: rowSelection,
      onRowSelectionChange: setRowSelection,
    },
    commands,
    getRowId: (row) => row.id,
  })

  return (
    <Container>
      <DataTable instance={table}>
        <DataTable.Toolbar className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
          <Heading>Reviews</Heading>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter)
                setPagination({ ...pagination, pageIndex: 0 })
              }}
              className="px-3 py-1.5 border border-gray-200 rounded-md text-sm"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </DataTable.Toolbar>
        <DataTable.Table />
        <DataTable.Pagination />
        <DataTable.CommandBar selectedLabel={(count) => `${count} selected`} />
      </DataTable>

      {/* Response Editor Modal */}
      {editingResponse && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <Heading level="h2">
                {data?.reviews.find((r) => r.id === editingResponse)?.admin_response
                  ? "Edit Admin Response"
                  : "Add Admin Response"}
              </Heading>
              <button
                onClick={() => {
                  setEditingResponse(null)
                  setResponseContent("")
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <div className="text-sm text-gray-600 mb-2">Review:</div>
              <div className="bg-gray-50 p-3 rounded text-sm">
                <div className="font-medium mb-1">
                  {data?.reviews.find((r) => r.id === editingResponse)?.title}
                </div>
                <div className="text-gray-600">
                  {data?.reviews.find((r) => r.id === editingResponse)?.content}
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Your Response *</label>
              <Textarea
                value={responseContent}
                onChange={(e) => setResponseContent(e.target.value)}
                placeholder="Enter your response to this review..."
                rows={6}
                maxLength={2000}
                className="w-full"
              />
              <div className="text-xs text-gray-500 mt-1">
                {responseContent.length}/2000 characters
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              {data?.reviews.find((r) => r.id === editingResponse)?.admin_response && (
                <Button
                  variant="secondary"
                  onClick={() => handleResponseDelete(editingResponse)}
                  disabled={isSubmittingResponse}
                >
                  Delete Response
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  setEditingResponse(null)
                  setResponseContent("")
                }}
                disabled={isSubmittingResponse}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleResponseSubmit(editingResponse)}
                disabled={isSubmittingResponse || !responseContent.trim()}
              >
                {isSubmittingResponse ? "Saving..." : "Save Response"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Toaster />
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Reviews",
  icon: ChatBubbleLeftRight,
})

export default ReviewsPage
