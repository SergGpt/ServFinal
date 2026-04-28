<script>
    import BusinessInfo from "../../../../../components/BusinessInfo/index.svelte";
    import { getName, getType } from "../../../../../modules/formats";
    import { countMoneyToDollar, formatThousands } from "../../../../../modules/money";

    import "./style.scss";

    export let data;
</script>

<div class={ `${data.type}-info` }>
    <div class="title">
        { getName(data) }
        <div class="price">
            <div class="animated-number">
                <span>{ countMoneyToDollar(data.currentBet) }</span>
            </div>
        </div>
    </div>
    <div class="additional-info__second-row first">
        <div class="column">
            <span class="additional-info__label" >Тип имущества:</span>
            <span class="additional-info__value">{ getType(data.type) }</span>
        </div>
        <div class="column">
            <span class="additional-info__label" >Шаг ставки:</span>
            <span class="additional-info__value">{ countMoneyToDollar(data.betStep) }</span>
        </div>
        <div class="gov-price">
            <div class="gov-price__label">Гос. цена:</div>
            <div class="gov-price__value">{ countMoneyToDollar(data.params.cost ) }</div>
        </div>
    </div>
    <div class="additional-info">
        <div class="additional-info__second-row">
            <div class="column">
                <span class="additional-info__label">Район:</span>
                <span class="additional-info__value">{ data.params.area }</span>
            </div>
        </div>
    </div>

    <BusinessInfo businessId={data.params.id} />
</div>