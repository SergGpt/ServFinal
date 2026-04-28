<script>
    import { executeClient } from "api/rage";

    import UserInfo from "../../../components/UserInfo/index.svelte";
    import CreateModal from "../../../modals/CreateModal/index.svelte";
    import { getPicture } from "../../../modules/picture";

    import BusinessInfo from "../../../components/BusinessInfo/index.svelte";
    import VehicleInfo from "../../../components/VehicleInfo/index.svelte";

    import { charUUID } from "store/chars";

    import "./style.scss";
    import { calculateMinPrice, getName, getType } from "../../../modules/formats";
    import { countMoneyToDollar, formatThousands } from "../../../modules/money";
    import { createLot, editLot, setModalState } from "../../../modules/functions";

    export let data;
    export let backFunction;
    export let isEditing;

    let commentInput = data.comment || "",
        titleInput = data.params && data.params.name || "",
        priceInput = `$${ isEditing ? formatThousands(data.cost) : 0 }`,
        totalPrice = 0,
        minPrice = calculateMinPrice(data);

    $: totalPrice = Number(priceInput.toString().replace(/\D/g, ''));
    $: minPrice = calculateMinPrice(data);

    const callbackCreateLot = (hours, paymentType, count, price) => {
        setModal(null);

        createLot(data, totalPrice, {
            hours,
            paymentType,
            count: 1,
            title: titleInput,
            comment: commentInput
        });

        backFunction();
    }

    const actionLot = () => {
        if (totalPrice < minPrice)
            return window.notificationAdd(1, 9, "Цена слишком маленькая!", 3000);

        if (data.type == 'service' && titleInput.length < 6)
            return window.notificationAdd(1, 9, "Длина заголовка должна быть от 6 до 64 символов!", 3000);

        if (isEditing) {
            editLot(data.id, data, {
                comment: commentInput,
                title: titleInput,
                price: totalPrice
            });

            backFunction();
        }
        else
            setModal("create");
    };

    function handleInput(event) {
        const value = event.target.value;

        let formattedValue = value.toString().replace(/\D/g, '');

        if (Number(formattedValue) < 0 || formattedValue == '')
            formattedValue = "0";

        priceInput = `$${formatThousands(Number(formattedValue))}`;
    }

    let modal = null;
    const setModal = (modalName) => {
        modal = modalName;
        setModalState(modalName)
    }
</script>

<div class="page-data create-modal">
    {#if modal != null}
        <CreateModal type={data.type} data={data} setModal={setModal} price={totalPrice} callback={callbackCreateLot} />
    {/if}

    <div class="header">
        <div class="header__content">
            <div class="back-container">
                <button on:click={() => backFunction()} class="back-container__button" >
                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14" > <defs> <clipPath id="clip-path"> <rect id="Прямоугольник_4874" data-name="Прямоугольник 4874" width="14" height="14" transform="translate(43.58 12.58)" fill="#101010" ></rect> </clipPath> </defs> <g id="Группа_масок_22" data-name="Группа масок 22" transform="translate(-43.58 -12.58)" opacity="0.5" > <path id="Контур_12569" data-name="Контур 12569" d="M55.613,21.044h-12" transform="translate(1.966 -1.465)" fill="none" stroke="#101010" stroke-width="2" ></path> <path id="Контур_12570" data-name="Контур 12570" d="M48.814,12.58l-5,5,5,5" transform="translate(1.766 2)" fill="none" stroke="#101010" stroke-width="2" ></path> </g> </svg>
                </button>
                Вернуться назад
            </div>
        </div>

        <UserInfo />
    </div>

    <div class="content">
        <div class="container__inner" class:no-right={data.type == "service"}>
            <div class="container__inner__left-side">
                <div class="adv__cover">
                    <div class="adv__cover__title">
                        Обложка объявления
                    </div>
                    <div class="adv__cover__columns">
                        <div class="adv__cover__default-cover">
                            <div class="title">
                                Стандартная обложка
                            </div>
                            <div class={ `square-${data.type} square` } style="background-image: url({getPicture(data.type, data)});">
                                {#if data.type == "service"}
                                    <svg xmlns="http://www.w3.org/2000/svg" width="6.481481481481481vh" height="4.685740740740741vh" viewBox="0 0 70 50.606" class="create-hands-svg" > <g id="hand-shake_1_" data-name="hand-shake (1)" transform="translate(0 -9.697)" > <path id="Контур_12685" data-name="Контур 12685" d="M70,15.972v21.19s-4.535.893-5.469,1.011-3.858,1.062-5.979-.977C55.28,34.061,43.659,22.5,43.659,22.5s-2-1.966-5.221-.267c-2.954,1.557-7.332,3.838-9.16,4.726a4.209,4.209,0,0,1-6.322-3.3c0-1.725,1.076-2.9,2.615-3.757,4.17-2.528,12.959-7.461,16.619-9.406,2.225-1.183,3.828-1.285,6.883,1.289,3.762,3.164,7.11,6.048,7.11,6.048a3.479,3.479,0,0,0,2.834.544C63.292,17.475,70,15.972,70,15.972Zm-46.258,35.9A3.7,3.7,0,0,0,19.3,46.759a3.818,3.818,0,0,0-.806-3.769,3.906,3.906,0,0,0-3.735-.945,3.815,3.815,0,0,0-.809-3.764,4.217,4.217,0,0,0-5.9.155c-1.726,1.657-2.832,4.658-1.291,6.424s3.306.688,4.653.381c-.375,1.337-1.5,2.58-.115,4.33s3.306.689,4.654.384c-.376,1.332-1.45,2.7-.12,4.322s3.54.76,4.992.309c-.56,1.44-1.76,2.993-.219,4.733s5.093.942,6.83-.715a4.141,4.141,0,0,0,.375-5.854A3.943,3.943,0,0,0,23.742,51.876ZM55.427,40.852c-12.553-12.553-6.649-6.646-13.4-13.416a4.4,4.4,0,0,0-4.706-.847c-1.878.823-4.3,1.945-6.117,2.8a10.093,10.093,0,0,1-4.114,1.369A6.979,6.979,0,0,1,23.4,17.84c2.789-1.93,9.21-5.345,9.21-5.345a8.059,8.059,0,0,0-6.241-2.479c-4.284,0-13.233,5.863-13.233,5.863a7,7,0,0,1-6.158.161L0,13.611V37.858s1.992.577,3.782,1.308a7.973,7.973,0,0,1,1.961-3.1c2.969-2.828,7.891-2.858,10.592-.076a6.684,6.684,0,0,1,1.672,2.969,6.764,6.764,0,0,1,2.867,1.748,6.67,6.67,0,0,1,1.674,2.964,6.82,6.82,0,0,1,4.637,5,6.862,6.862,0,0,1,2.991,1.793,7.055,7.055,0,0,1,1.851,6.112.011.011,0,0,1,.011,0c.027.035,1.006,1.127,1.617,1.742a3.077,3.077,0,0,0,4.352-4.352c-.043-.043-4.318-4.514-3.974-4.861s5.788,5.323,5.889,5.427a3.075,3.075,0,0,0,4.349-4.349c-.059-.056-.3-.291-.395-.384,0,0-5.4-4.811-4.989-5.222s7.124,5.846,7.135,5.846a3.037,3.037,0,0,0,4.375-4.2c-.021-.064-5.112-5.384-4.715-5.784s5.44,4.781,5.451,4.792a3.077,3.077,0,1,0,4.349-4.354C55.464,40.873,55.443,40.863,55.427,40.852Z" fill="#101010" ></path> </g> </svg>
                                {/if}
                            </div>
                        </div>
                        <div class="adv__cover__own-cover">
                            <div class="title">
                                Собственная обложка
                            </div>
                            <div class="square" style="background-image: url(&quot;null&quot;);">
                                <div class="no-cover">
                                    <svg id="free-icon-image-7205092" xmlns="http://www.w3.org/2000/svg" width="5.185185185185185vh" height="5.185185185185185vh" viewBox="0 0 56 56" > <path id="Контур_12667" data-name="Контур 12667" d="M45,28.952,39.06,34.888,61.6,51.8V41.832Z" transform="translate(-5.6 -5.6)" fill="#101010" ></path> <path id="Контур_12668" data-name="Контур 12668" d="M25.62,31.808,6.02,55.468A8.4,8.4,0,0,0,14,61.6H53.2a8.4,8.4,0,0,0,7.028-3.836Z" transform="translate(-5.6 -5.6)" fill="#101010" ></path> <path id="Контур_12669" data-name="Контур 12669" d="M23.072,26.18a2.8,2.8,0,0,1,3.808-.42l7.644,5.74,8.4-8.4a2.8,2.8,0,0,1,3.724-.2L61.6,34.72V14a8.4,8.4,0,0,0-8.4-8.4H14A8.4,8.4,0,0,0,5.6,14V47.152Z" transform="translate(-5.6 -5.6)" fill="#101010" ></path> </svg>
                                    <span>Кликните в область, чтобы загрузить обложку</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="adv__photos">
                    <div class="adv__photos__header">
                        <div class="title">
                            Прикрепите фотографии
                        </div>
                        <div class="adv__button upload">
                            <svg id="Icon" xmlns="http://www.w3.org/2000/svg" width="1.234537037037037vh" height="1.2962962962962963vh" viewBox="0 0 13.333 14" > <path id="Контур_12665" data-name="Контур 12665" d="M4,15.333v2A.667.667,0,0,0,4.667,18h12a.667.667,0,0,0,.667-.667v-2a.667.667,0,1,0-1.333,0v1.333H5.333V15.333a.667.667,0,1,0-1.333,0Z" transform="translate(-4 -4)" fill="#3d82d5" fill-rule="evenodd" ></path> <path id="Контур_12666" data-name="Контур 12666" d="M13,10.667v-6A.667.667,0,0,0,12.333,4H9a.667.667,0,0,0-.667.667v6H6.667A.666.666,0,0,0,6.2,11.8l4,4a.666.666,0,0,0,.943,0l4-4a.666.666,0,0,0-.471-1.138Z" transform="translate(-4 -4)" fill="#3d82d5" fill-rule="evenodd" ></path> </svg> 
                            Загрузить фото
                        </div>
                    </div>
                    <div class="no-images">
                        Фотографии не загружены
                    </div>
                </div>
                {#if data.type == "service"}
                    <div class="adv__enter-input">
                        <div class="adv__enter-input__title">
                            Введите заголовок объявления
                        </div>
                        <div class="adv__enter-input__form one-column" >
                            <div class="adv__input">
                                <input bind:value={titleInput} />
                            </div>
                        </div>
                    </div>
                {/if}
                <div class="adv__comment">
                    <div class="adv__comment__title">
                        Комментарий
                    </div>
                    <textarea bind:value={commentInput} class="adv__comment__textarea" ></textarea>
                </div>
                <div class="adv__enter-input">
                    <div class="adv__enter-input__title">
                        <p>Введите стоимость продажи</p>
                        <div>
                            <span>Минимальная стоимость по рынку</span>
                            <p>{ formatThousands(minPrice) }$</p>
                        </div>
                    </div>
                    <div class="adv__input">
                        <div class="trade-input adv__input--price" style="--icon-width: 0px;" >
                            <input bind:value={priceInput} 
                                on:input={handleInput}
                                maxlength="64"/>
                        </div>
                    </div>

                    <button on:click={actionLot} class="adv__button place-ad">
                        { isEditing ? 'Сохранить объявление' : 'Разместить объявление' }
                    </button>
                </div>
            </div>
            {#if data.type != "service" && data.type != "clothes"}
                <div class="container__inner__right-side">
                    <div class="table-info">
                        <div class="title">
                            { getName(data) }
                        </div>
                        {#if data.type == "vehicle"}
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
                            </div>
                        {:else if data.type == "house"}
                            <div class="badges house">
                                <div class="badge">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.0909259259259259vh" viewBox="0 0 14 11.782"> <g id="multiple-users-silhouette" transform="translate(0 -1.03)"> <path id="Контур_12568" data-name="Контур 12568" d="M8.448,3.052a2.544,2.544,0,0,1,1.184,1.89,2.052,2.052,0,1,0-1.184-1.89ZM7.1,7.256A2.053,2.053,0,1,0,5.05,5.2,2.053,2.053,0,0,0,7.1,7.256Zm.871.14H6.232A2.632,2.632,0,0,0,3.6,10.025v2.131l.005.033.147.046a11.967,11.967,0,0,0,3.575.576,7.338,7.338,0,0,0,3.121-.586l.137-.069H10.6V10.025A2.631,2.631,0,0,0,7.974,7.4Zm3.4-2.12H9.642a2.53,2.53,0,0,1-.781,1.763,3.124,3.124,0,0,1,2.231,2.989v.657a7.075,7.075,0,0,0,2.755-.579l.137-.07H14V7.905A2.632,2.632,0,0,0,11.371,5.276ZM3.5,5.137A2.04,2.04,0,0,0,4.592,4.82,2.541,2.541,0,0,1,5.548,3.2c0-.038.006-.077.006-.115A2.053,2.053,0,1,0,3.5,5.137Zm1.844,1.9a2.532,2.532,0,0,1-.78-1.753c-.064,0-.128-.01-.193-.01H2.629A2.632,2.632,0,0,0,0,7.905v2.131l.005.033.147.046a12.326,12.326,0,0,0,2.961.556v-.643A3.124,3.124,0,0,1,5.344,7.039Z" fill="#3d82d5"></path> </g> </svg> 
                                    { data.params.people }
                                </div>
                                <div class="badge">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <path id="XMLID_356_" d="M4.821,10.714h7v1.5h-7Z" transform="translate(-1.321 -1.715)" fill="#101010"></path> <path id="XMLID_358_" d="M11.821,9.536h-7v-1.5h7Z" transform="translate(-1.321 -1.536)" fill="#101010"></path> <path id="XMLID_360_" d="M4.821,13.393h7v1.5h-7Z" transform="translate(-1.321 -1.893)" fill="#101010"></path> <path id="XMLID_362_" d="M15.071,5.071v9.5a.5.5,0,0,1-.5.5h-2v-8a.5.5,0,0,0-.5-.5h-8a.5.5,0,0,0-.5.5v8h-2a.5.5,0,0,1-.5-.5v-9.5a.5.5,0,0,1,.263-.44l6.5-3.5a.5.5,0,0,1,.473,0l6.5,3.5A.5.5,0,0,1,15.071,5.071Z" transform="translate(-1.071 -1.072)" fill="#101010"></path> </svg> 
                                    { data.params.garages }
                                </div>

                                <div class="gov-price">
                                    <div class="gov-price__label">Гос. цена: </div>
                                    <div class="gov-price__value">{ countMoneyToDollar(data.params.cost) }</div>
                                </div>
                            </div>
                        {:else}
                            <div class="additional-info__second-row first" >
                                <div class="column">
                                    <span class="additional-info__label">{ data.type == "service" ? "Тип" : "Тип имущества" }:</span>
                                    <span class="additional-info__value">{ getType(data.type) }</span>
                                </div>

                                <div class="gov-price">
                                    <div class="gov-price__label">Гос. цена: </div>
                                    <div class="gov-price__value">{ countMoneyToDollar(data.params.cost) }</div>
                                </div>
                            </div>
                        {/if}
                        <div class="additional-info">
                            {#if data.type == "vehicle"}
                                <div class="additional-info__second-row">
                                    <div class="column">
                                        <span class="additional-info__label">Тип имущества:</span>
                                        <span class="additional-info__value">{ getType(data.type) }</span>
                                    </div>
                                    <div class="column">
                                        <span class="additional-info__label">Гос. цена:</span>
                                        <span class="additional-info__value">{ countMoneyToDollar(data.params.cost) }</span>
                                    </div>
                                </div>
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
                            {:else if (data.params.hasOwnProperty("area"))}
                                {#if data.type == "house"}
                                    <div class="additional-info__second-row">
                                        <div class="column">
                                            <span class="additional-info__label">Тип имущества:</span>
                                            <span class="additional-info__value">{ getType(data.type) }</span>
                                        </div>
                                        
                                    </div>
                                {/if}
                                <div class="additional-info__second-row">
                                    <div class="column">
                                        <span class="additional-info__label">Район:</span>
                                        <span class="additional-info__value">{ data.params.area }</span>
                                    </div>
                                </div>
                            {/if}
                        </div>
    
                        { #if data.type == "business" }<BusinessInfo businessId={data.params.id} />{/if}
                        { #if data.type == "vehicle" }<VehicleInfo data={data} />{/if}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>
