<script>
    import "./style.scss";
    import { charMoney, charBankMoney } from "store/chars";
    import { formatThousands, } from "../../modules/money";

    const onClick = () => {
        window.marketPlace.setPage("create");
    }
</script>

<div class="user-info">
    <div class="money-info">
        <div class="row cash">
            <span>
                <span>${formatThousands($charMoney)}</span>
                <span class="o-50 cents">,00</span>
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2019444444444443vh" viewBox="0 0 14 12.981" > <g id="wallet-money-cash-svgrepo-com" transform="translate(-1 -1.019)" > <path id="Контур_3" data-name="Контур 3" d="M13.5,5H3A1,1,0,0,1,3,3H5a.472.472,0,0,0,.5-.5A.472.472,0,0,0,5,2H3A2.006,2.006,0,0,0,1,4v8a2.006,2.006,0,0,0,2,2H13.5A1.473,1.473,0,0,0,15,12.5v-6A1.473,1.473,0,0,0,13.5,5ZM14,7.9v3.2a1.479,1.479,0,0,0-.5-.1h-2a1.5,1.5,0,0,1,0-3h2A1.479,1.479,0,0,0,14,7.9Z" fill="#3d82d5" ></path> <path id="Контур_4" data-name="Контур 4" d="M3.5,3.5A.472.472,0,0,0,3,4a.472.472,0,0,0,.5.5H13a.617.617,0,0,0,.4-.2.486.486,0,0,0,.05-.45l-1-2.5a.52.52,0,0,0-.65-.3L5.4,3.5Z" fill="#3d82d5" ></path> <path id="Контур_5" data-name="Контур 5" d="M12.5,9h-1a.5.5,0,0,0,0,1h1a.5.5,0,0,0,0-1Z" fill="#3d82d5" ></path> </g> </svg>
        </div>
        <div class="row bank">
            <span>
                <span>${formatThousands($charBankMoney)}</span>
                <span class="o-50 cents">,00</span>
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.1666666666666665vh" viewBox="0 0 14 12.6" > <path id="Контур_2" data-name="Контур 2" d="M15.417,7.025v7a.7.7,0,0,1-.7.7H2.117a.7.7,0,0,1-.7-.7v-7Zm0-1.4h-14v-2.8a.7.7,0,0,1,.7-.7h12.6a.7.7,0,0,1,.7.7Zm-4.9,5.6v1.4h2.8v-1.4Z" transform="translate(-1.417 -2.125)" fill="#101010" ></path> </svg>
        </div>
    </div>

    <div class="create-button">
        <button on:click={onClick}>
            <svg height="14" viewBox="0 0 14 14" width="14" xmlns="http://www.w3.org/2000/svg" ><g id="layer1" transform="translate(-0.634 -698.408)" ><path id="path823" d="M7.637.635a7,7,0,1,0,7,7A7.012,7.012,0,0,0,7.637.635Zm-.01,3.808a.636.636,0,0,1,.644.649V7h1.906a.637.637,0,0,1,0,1.274H8.271v1.906a.637.637,0,1,1-1.274,0V8.272H5.091A.638.638,0,1,1,5.091,7H7V5.092a.636.636,0,0,1,.63-.649Z" fill="#fcfcfc" fill-rule="evenodd" transform="translate(0 697.773)" ></path></g ></svg> 
            Создать
        </button>
    </div>

    <div class="avatar">
        <img src="https://cdn.majestic-files.com/img/avatars/male.svg" alt="avatar" />
    </div>
</div>
