<script>
    import { onMount } from "svelte";
    import { executeClient } from "api/rage";
    import Select from "../Select/index.svelte";
    import { TIME_RANGE_OPTIONS } from "../../configs/sort";
    import { formatThousands } from "../../modules/money";

    export let businessId;

    onMount(() => {
        executeClient("client.marketPlace.request", "businessStats", businessId);
    });

    let currentTimeRange = "month",
        businessSettings = {
            "yesterday": { "income": 1000, "netProfit": 1200, "averageCheck": 2000, governmentPrice: 500000, salesCount: 15, profitability: 75 },
            "week": { "income": 4000, "netProfit": 1200, "averageCheck": 2000, governmentPrice: 500000, salesCount: 15, profitability: 75 },
            "month": { "income": 1000, "netProfit": 1200, "averageCheck": 2000, governmentPrice: 500000, salesCount: 15, profitability: 75 },
            "quarter": { "income": 1000, "netProfit": 1200, "averageCheck": 2000, governmentPrice: 500000, salesCount: 15, profitability: 75 },
            "year": { "income": 1000, "netProfit": 1200, "averageCheck": 2000, governmentPrice: 500000, salesCount: 15, profitability: 75 },
        },
        currentSettings = businessSettings[currentTimeRange];

    window.marketPlace.resolve_businessStats = (stats) => {
        businessSettings = stats;
    };
        
    $: currentSettings = businessSettings[currentTimeRange];
</script>

<div class="business-info__stats">
    <div class="business-info__stats__header" >
        <div class="business-info__stats__header__tabs" >
            <div class="tab selected">
                Общая статистика
            </div>
        </div>
        <div class="business-info__stats__header__time-range" >
            <Select icon="time" onClick={(type) => currentTimeRange = type} options={TIME_RANGE_OPTIONS} canClear={false} current={currentTimeRange} />
        </div>
    </div>
    <div class="business-info__stats__container" >
        <div class="card">
            <div class="card__header">
                Выручка
            </div>
            <div class="card__value">
                <div class="card__value__money" >
                    <div class="card__value__money__dollar-sign">$</div>
                    <div class="card__value__money__first">{formatThousands(currentSettings.income)}</div>
                    <div class="card__value__money__last">,00</div>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card__header">
                Чистая прибыль
            </div>
            <div class="card__value">
                <div class="card__value__money" >
                    <div class="card__value__money__dollar-sign">$</div>
                    <div class="card__value__money__first">{formatThousands(currentSettings.netProfit)}</div>
                    <div class="card__value__money__last">,00</div>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card__header">
                Средний чек
            </div>
            <div class="card__value">
                <div class="card__value__money" >
                    <div class="card__value__money__dollar-sign">$</div>
                    <div class="card__value__money__first">{formatThousands(currentSettings.averageCheck)}</div>
                    <div class="card__value__money__last">,00</div>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card__header">
                Государственная цена
            </div>
            <div class="card__value">
                <div class="card__value__money" >
                    <div class="card__value__money__dollar-sign">$</div>
                    <div class="card__value__money__first">{formatThousands(currentSettings.governmentPrice)}</div>
                    <div class="card__value__money__last">,00</div>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card__header">Количество продаж</div>
            <div class="card__value">{formatThousands(currentSettings.salesCount)}</div>
        </div>
        <div class="card">
            <div class="card__header"> Рентабельность </div>
            <div class="card__value">{currentSettings.profitability}%</div>
        </div>
    </div>
</div>