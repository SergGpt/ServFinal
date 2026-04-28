<script>
    import VehicleInfo from "../../../../../components/VehicleInfo/index.svelte";
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
    <div class="badges">
        <div class="badge mileage">
            <svg id="highway" xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <path id="Контур_12625" data-name="Контур 12625" d="M13.59,5.77H.41a.41.41,0,0,0,0,.82H.82V7.82a.41.41,0,0,0,.82,0V6.59H12.359V7.82a.41.41,0,0,0,.82,0V6.59h.41a.41.41,0,0,0,0-.82Z" fill="#101010"></path> <path id="Контур_12626" data-name="Контур 12626" d="M9.488,0H7.82a.41.41,0,0,0-.41.41V4.949h3.341L9.891.334A.41.41,0,0,0,9.488,0Z" fill="#101010"></path> <path id="Контур_12627" data-name="Контур 12627" d="M12.265,13.852a.408.408,0,0,0,.087-.338l-1.139-6.1H7.41v6.18a.41.41,0,0,0,.41.41h4.129A.411.411,0,0,0,12.265,13.852Z" fill="#101010"></path> <path id="Контур_12628" data-name="Контур 12628" d="M6.18,14a.41.41,0,0,0,.41-.41V7.41h-3.8l-1.139,6.1a.41.41,0,0,0,.4.486Z" fill="#101010"></path> <path id="Контур_12629" data-name="Контур 12629" d="M4.512,0a.41.41,0,0,0-.4.334l-.86,4.615H6.59V.41A.41.41,0,0,0,6.18,0Z" fill="#101010"></path> </svg> 
            { formatThousands(data.params.mileage) } км.
        </div>
        <div class="badge kg">
            { formatThousands(data.params.capacity) }
            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14" class="kg"> <g id="Сгруппировать_1769" data-name="Сгруппировать 1769" transform="translate(-1 -1)"> <rect id="Прямоугольник_11" data-name="Прямоугольник 11" width="14" height="14" rx="4" transform="translate(1 1)" fill="#0f0f0f" opacity="0.34"></rect> <path id="Контур_9727" data-name="Контур 9727" d="M5.638-1.356H4.058l-1.54-2.61-.47.74v1.87H.708v-6.67h1.34V-5l1.88-3.03h1.56l-2.13,3.14Zm2.79.12a2.509,2.509,0,0,1-2.045-.95,3.831,3.831,0,0,1-.775-2.5,3.827,3.827,0,0,1,.775-2.505,2.514,2.514,0,0,1,2.045-.945,2.179,2.179,0,0,1,1.365.425,2.772,2.772,0,0,1,.855,1.105l-1.09.51a1.216,1.216,0,0,0-1.13-.85,1.2,1.2,0,0,0-1.045.6,3,3,0,0,0-.4,1.66,3,3,0,0,0,.4,1.66,1.2,1.2,0,0,0,1.045.6,1.289,1.289,0,0,0,1.01-.4v-1.01H8.188v-1.18h2.52V-2.3A2.862,2.862,0,0,1,8.428-1.236Z" transform="translate(2.292 12.686)" fill="#fbfbfb"></path> </g> </svg>
        </div>
        <div class="gas-type">
            <svg xmlns="http://www.w3.org/2000/svg" width="1.3888888888888888vh" height="1.6666666666666665vh" viewBox="0 0 15 18" class="gas-type__icon"> <g id="gas-station" transform="translate(-1.5)"> <g id="Сгруппировать_1643" data-name="Сгруппировать 1643"> <path id="Контур_9457" data-name="Контур 9457" d="M16.39,2.36,14.89.86a.375.375,0,0,0-.53.53l1.235,1.235L14.36,3.86a.375.375,0,0,0-.11.265V5.25a1.5,1.5,0,0,0,1.5,1.5v6.375a.375.375,0,0,1-.75,0v-.75a1.126,1.126,0,0,0-1.125-1.125H13.5V1.5A1.5,1.5,0,0,0,12,0H4.5A1.5,1.5,0,0,0,3,1.5V15a1.5,1.5,0,0,0-1.5,1.5v1.125A.375.375,0,0,0,1.875,18h12.75A.375.375,0,0,0,15,17.625V16.5A1.5,1.5,0,0,0,13.5,15V12h.375a.375.375,0,0,1,.375.375v.75a1.125,1.125,0,0,0,2.25,0V2.625A.375.375,0,0,0,16.39,2.36ZM12,6.382a.375.375,0,0,1-.375.375H4.875A.375.375,0,0,1,4.5,6.382V1.875A.375.375,0,0,1,4.875,1.5h6.75A.375.375,0,0,1,12,1.875Z" fill="#1e2124"></path> </g> </g> </svg>
            <div class="gas-type__badge gas-type__badge-{data.params.gas.toLowerCase()}">{ data.params.gas }</div>
        </div>
        <div class="gov-price">
            <div class="gov-price__label">Гос. цена: </div>
            <div class="gov-price__value">{ countMoneyToDollar(data.params.cost) }</div>
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
    </div>
    <div class="additional-info">
        <div class="additional-info__second-row">
            <div class="column">
                <span class="additional-info__label">Гос. номер:</span>
                <span class="additional-info__value">{ data.params.numberPlate }</span>
            </div>
            <div class="column">
                <span class="additional-info__label">Автосалон:</span>
                <span class="additional-info__value">{ data.params.motorShow }</span>
            </div>
        </div>
    </div>

    <VehicleInfo data={data} />
</div>