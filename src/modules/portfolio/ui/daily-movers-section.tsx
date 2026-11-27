import type { PortfolioLedger } from "../application/get-portfolio-ledger";
import { getMonthPositions } from "../application/get-month-positions";
import { getHoldingsAnalytics } from "../application/get-holdings-analytics";
import { dailyMovers } from "../presentation/daily-movers";
import { DailyMovers } from "./daily-movers";

export async function DailyMoversSection({referenceDate,ledger,labels}:{referenceDate:Date;ledger:PortfolioLedger|null;labels:Record<string,string>}) {
 const month=await getMonthPositions(referenceDate);
 const holdings=month?await getHoldingsAnalytics(month,ledger):null;
 return <DailyMovers rows={holdings?dailyMovers(holdings.positions,holdings.data,labels):[]}/>;
}
