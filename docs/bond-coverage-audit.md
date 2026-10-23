# International bond lookup coverage audit

Verified on 2026-10-23 using the deployed application lookup implementation (commit `498c618`) and live public providers. No accounts, purchases, financial balances or database records were created or changed.

## Result

12 real instruments across 8 issuer countries: **0 incorrect auto-filled fields**, **5 partial term results**, **7 identification-only results**. All providers responded in this run. This is a sample verification, not proof of universal coverage or permanent provider availability.

| Issuer country | Instrument / ISIN | Automatically returned terms | Result |
| --- | --- | --- | --- |
| United States | [Citigroup 4.125% 2028](https://www.sec.gov/Archives/edgar/data/831001/000119312516650772/d229108dfwp.htm) · `US172967KU42` | issuer, issuerCountry, currency, family, maturityDate, faceValuePerBond, structure, annualRate, frequency, anchorDate | Matched checked terms |
| Brazil | [Brazil Global 7.125% 2037](https://www.sec.gov/Archives/edgar/data/205317/000119312506005040/dfwp.htm) · `US105756BK57` | issuer, issuerCountry, currency, family, maturityDate | Matched checked terms |
| Ireland | [Ireland 1.7% 2037](https://www.ntma.ie/business-areas/funding-and-debt-management/government-securities/government-bonds) · `IE00BV8C9B83` | issuer, issuerCountry, currency, family, maturityDate | Matched checked terms |
| Germany | [Bund 0.5% 2027](https://www.deutsche-finanzagentur.de/bundeswertpapiere/factsheet/isin/DE0001102424/) · `DE0001102424` | None; instrument identification only | Left manual |
| France | [OAT 0% 2032](https://www.aft.gouv.fr/fr/titre/fr0014007l00) · `FR0014007L00` | None; instrument identification only | Left manual |
| Italy | [BTP 1.7% 2051](https://www.gazzettaufficiale.it/atto/serie_generale/caricaArticoloDefault/originario?atto.codiceRedazionale=22A02653&atto.dataPubblicazioneGazzetta=2022-05-02&atto.tipoProvvedimento=DECRETO) · `IT0005425233` | None; instrument identification only | Left manual |
| Spain | [Obligacion 1.4% 2028](https://www.cnmv.es/portal/ancv/isin?isin=ES0000012B88&lang=es) · `ES0000012B88` | None; instrument identification only | Left manual |
| United Kingdom | [Gilt 4.75% 2030 (GBP)](https://www.dmo.gov.uk/media/5okds4m0/080726conventional_2.pdf) · `GB00B24FF097` | None; instrument identification only | Left manual |
| United States | [Morgan Stanley Bank NA (user example)](https://www.openfigi.com/api/documentation) · `US61690D6W39` | None; instrument identification only | Left manual |
| United States | [Morgan Stanley Private Bank (user example)](https://www.openfigi.com/api/documentation) · `US61768UU475` | None; instrument identification only | Left manual |
| United States | [Treasury Note 4.375% 2034](https://www.treasurydirect.gov/instit/annceresult/press/preanre/2024/R_20240710_2.pdf) · `US91282CKQ32` | issuer, issuerCountry, family, currency, structure, maturityDate, annualRate, frequency, anchorDate | Matched checked terms |
| United States | [Treasury TIPS 2034](https://treasurydirect.gov/instit/annceresult/tipscpi/2025/CPI_20250715.pdf) · `US91282CJY84` | issuer, issuerCountry, family, currency, structure, maturityDate | Matched checked terms |

## Checks and limits

- Returned currency, maturity, coupon rate, frequency, denomination, issuer country, family and structure were compared with issuer/regulator documents linked above. Only returned fields were counted as verified; missing fields are not successful autofill.
- Treasury identifiers were entered as full checksum-valid US ISINs; the embedded CUSIP correctly selected the official Treasury dataset. The Note matched 4.375%, maturity 2034-05-15, semiannual May/November payments. The TIPS was classified Inflation and did not acquire a fictitious fixed nominal coupon schedule.
- Brazil has a US-prefixed ISIN and USD denomination but is correctly reported as Brazil. No issuer country, denomination or coupon was inferred from a prefix, name, auction yield or minimum purchase amount.
- France’s zero-coupon OAT, German Bund, Italian BTP, Spanish government bond, UK Gilt and the two Morgan Stanley examples returned identification only. No coupon/maturity/currency was invented from OpenFIGI ticker text.
- The GBP Gilt is a negative currency control: it is identified, but GBP position entry is not supported by the current USD/EUR-only form. The audit does not claim that this holding can be registered in GBP.
- Quantity, purchase date, total paid and purchase accrued interest remain personal manual inputs. Seven identification-only results do not prove independent verification of all their contractual terms; the two Morgan Stanley controls have provider identification only.

## Reproduce

Run `node --import tsx scripts/test-bond-coverage.ts` from the repository. It performs read-only requests, prints each result and exits nonzero if a returned term contradicts the independent fixture or required known coverage is missing. Network failures are reported separately from incorrect values. Unit tests exercise the same country/prefix controls without network access.
