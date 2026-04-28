<script>
    import VehicleInfo from "../../../../../components/VehicleInfo/index.svelte";
    import { getName, getType } from "../../../../../modules/formats";
    import {
        countMoneyToDollar,
        formatThousands,
    } from "../../../../../modules/money";

    import "./style.scss";

    export let data;
</script>

<div class="house-info">
    <div class="title">
        { getName(data) }
        <div class="price">
            <div class="animated-number">
                <span>{ countMoneyToDollar(data.currentBet) }</span>
            </div>
        </div>
    </div>
    <div class="badges">
        <div class="badge">
            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.0909259259259259vh" viewBox="0 0 14 11.782"> <g id="multiple-users-silhouette" transform="translate(0 -1.03)"> <path id="Контур_12568" data-name="Контур 12568" d="M8.448,3.052a2.544,2.544,0,0,1,1.184,1.89,2.052,2.052,0,1,0-1.184-1.89ZM7.1,7.256A2.053,2.053,0,1,0,5.05,5.2,2.053,2.053,0,0,0,7.1,7.256Zm.871.14H6.232A2.632,2.632,0,0,0,3.6,10.025v2.131l.005.033.147.046a11.967,11.967,0,0,0,3.575.576,7.338,7.338,0,0,0,3.121-.586l.137-.069H10.6V10.025A2.631,2.631,0,0,0,7.974,7.4Zm3.4-2.12H9.642a2.53,2.53,0,0,1-.781,1.763,3.124,3.124,0,0,1,2.231,2.989v.657a7.075,7.075,0,0,0,2.755-.579l.137-.07H14V7.905A2.632,2.632,0,0,0,11.371,5.276ZM3.5,5.137A2.04,2.04,0,0,0,4.592,4.82,2.541,2.541,0,0,1,5.548,3.2c0-.038.006-.077.006-.115A2.053,2.053,0,1,0,3.5,5.137Zm1.844,1.9a2.532,2.532,0,0,1-.78-1.753c-.064,0-.128-.01-.193-.01H2.629A2.632,2.632,0,0,0,0,7.905v2.131l.005.033.147.046a12.326,12.326,0,0,0,2.961.556v-.643A3.124,3.124,0,0,1,5.344,7.039Z" fill="#3d82d5"></path> </g> </svg> 
            { formatThousands(data.params.people) }
        </div>
        <div class="badge">
            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <path id="XMLID_356_" d="M4.821,10.714h7v1.5h-7Z" transform="translate(-1.321 -1.715)" fill="#101010"></path> <path id="XMLID_358_" d="M11.821,9.536h-7v-1.5h7Z" transform="translate(-1.321 -1.536)" fill="#101010"></path> <path id="XMLID_360_" d="M4.821,13.393h7v1.5h-7Z" transform="translate(-1.321 -1.893)" fill="#101010"></path> <path id="XMLID_362_" d="M15.071,5.071v9.5a.5.5,0,0,1-.5.5h-2v-8a.5.5,0,0,0-.5-.5h-8a.5.5,0,0,0-.5.5v8h-2a.5.5,0,0,1-.5-.5v-9.5a.5.5,0,0,1,.263-.44l6.5-3.5a.5.5,0,0,1,.473,0l6.5,3.5A.5.5,0,0,1,15.071,5.071Z" transform="translate(-1.071 -1.072)" fill="#101010"></path> </svg> 
            { formatThousands(data.params.garages) }
        </div>
        <div class="gov-price">
            <div class="gov-price__label">Гос. цена:</div>
            <div class="gov-price__value">{ countMoneyToDollar(data.params.cost) }</div>
        </div>
    </div>
    <div class="additional-info">
        <div class="additional-info__second-row">
            <div class="column">
                <span class="additional-info__label">Тип имущества:</span>
                <span class="additional-info__value">{ getType(data.type) }</span>
            </div>
            <div class="column">
                <span class="additional-info__label">Шаг ставки:</span>
                <span class="additional-info__value">{ countMoneyToDollar(data.betStep) }</span>
            </div>
        </div>
        <div class="additional-info__second-row">
            <div class="column">
                <span class="additional-info__label">Район:</span>
                <span class="additional-info__value">{ data.params.area }</span>
            </div>
        </div>
    </div>
</div>
