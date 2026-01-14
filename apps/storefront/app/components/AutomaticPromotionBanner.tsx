import { Gift, Truck } from "lucide-react";

interface AutomaticPromotionBannerProps {
  type: "free_shipping" | "discount";
  message: string;
  isApplied: boolean;
  progressPercent: number;
  showProgress?: boolean;
}

/**
 * Banner displaying automatic promotion status
 * Shows progress bar when threshold not yet met
 */
export function AutomaticPromotionBanner({
  type,
  message,
  isApplied,
  progressPercent,
  showProgress = true,
}: AutomaticPromotionBannerProps) {
  const Icon = type === "free_shipping" ? Truck : Gift;
  
  const bgColor = isApplied 
    ? "bg-green-50 border-green-200" 
    : "bg-blue-50 border-blue-200";
  
  const textColor = isApplied 
    ? "text-green-700" 
    : "text-blue-700";
  
  const iconColor = isApplied 
    ? "text-green-600" 
    : "text-blue-600";
  
  const progressBgColor = isApplied 
    ? "bg-green-500" 
    : "bg-blue-500";

  return (
    <div className={`rounded-lg border p-3 ${bgColor}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
        <span className={`text-sm font-medium ${textColor}`}>{message}</span>
      </div>
      
      {showProgress && !isApplied && (
        <div className="mt-2">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full ${progressBgColor} transition-all duration-300 ease-out`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 text-right">
            {Math.floor(progressPercent)}% there
          </p>
        </div>
      )}
    </div>
  );
}
