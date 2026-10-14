"use client";

import { englishLabel } from "@/lib/english-labels";

import NumberFlow from "@number-flow/react";
import { ArrowDownRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import { KpiCard } from "@/components/product/kpi-card";
import { formatBrl } from "@/modules/portfolio/presentation/portfolio-format";


const percentFormat = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function ChangeKpiCard({
  label,
  changeBrl,
  changePercent,
  emptyDetail,
  detailSuffix,
  testId,
  footer,
}: {
  label: string;
  changeBrl: number | null;
  changePercent: number | null;
  emptyDetail: string;
  detailSuffix?: string;
  testId?: string;
  footer?: ReactNode;
}) {
  return (
    <KpiCard
      label={englishLabel(label)}
      testId={testId}
      footer={footer}
      icon={
        (changeBrl ?? 0) >= 0 ? (
          <ArrowUpRightIcon aria-hidden="true" size={18} weight="bold" />
        ) : (
          <ArrowDownRightIcon aria-hidden="true" size={18} weight="bold" />
        )
      }
      tone={changeBrl === null ? "neutral" : changeBrl >= 0 ? "up" : "down"}
      valueText={changePercent === null ? "—" : percentFormat.format(changePercent / 100)}
      value={
        changePercent === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <NumberFlow
            value={changePercent / 100}
            format={{ style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }}
            locales="en-GB"
          />
        )
      }
      detail={
        changeBrl === null
          ? emptyDetail
          : detailSuffix
            ? `${formatBrl(changeBrl)} ${detailSuffix}`
            : formatBrl(changeBrl)
      }
    />
  );
}
